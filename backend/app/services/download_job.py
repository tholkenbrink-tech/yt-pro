from __future__ import annotations

import logging
import os
import re
import traceback
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import sanitize_filename
from app.models.app_settings import SINGLETON_ID, AppSettings
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.download_profile import DownloadProfile
from app.models.status import IN_PROGRESS_STATUSES, Status
from app.services import ytdlp_runner
from app.services.format_selector import build_format_selector

logger = logging.getLogger("yt_pro.worker")

PROGRESS_RE = re.compile(
    r"\[download\]\s+(?P<percent>[\d.]+)%\s+of\s+~?\s*(?P<total>[\d.]+)(?P<total_unit>\w+)"
    r"(?:\s+at\s+(?P<speed>[\d.]+)(?P<speed_unit>\w+/s))?"
    r"(?:\s+ETA\s+(?P<eta>[\d:]+))?"
)

_UNIT_MULTIPLIERS = {"B": 1, "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3}


def _parse_size(value: str, unit: str) -> Optional[int]:
    mult = _UNIT_MULTIPLIERS.get(unit)
    if mult is None:
        return None
    return int(float(value) * mult)


def _parse_eta(eta: str) -> Optional[int]:
    parts = eta.split(":")
    try:
        parts = [int(p) for p in parts]
    except ValueError:
        return None
    seconds = 0
    for p in parts:
        seconds = seconds * 60 + p
    return seconds


def _get_retention_hours() -> int:
    db = SessionLocal()
    try:
        row = db.get(AppSettings, SINGLETON_ID)
        if row and row.retentionHours is not None:
            return row.retentionHours
        return settings.DEFAULT_RETENTION_HOURS
    finally:
        db.close()


def _profile_for(db, quality: str) -> DownloadProfile:
    profile = db.execute(select(DownloadProfile).where(DownloadProfile.name == quality)).scalar_one_or_none()
    if not profile:
        raise ValueError(f"Unknown quality profile: {quality}")
    return profile


def _make_progress_handler(db, item: DownloadItem, job: DownloadJob):
    def handler(line: str):
        match = PROGRESS_RE.search(line)
        if not match:
            return
        groups = match.groupdict()
        try:
            progress = float(groups["percent"])
        except (TypeError, ValueError):
            progress = item.progress

        total_bytes = _parse_size(groups["total"], groups["total_unit"]) if groups.get("total") else None
        speed = (
            _parse_size(groups["speed"], groups["speed_unit"].replace("/s", ""))
            if groups.get("speed")
            else None
        )
        eta = _parse_eta(groups["eta"]) if groups.get("eta") else None

        item.progress = progress
        if total_bytes:
            item.estimatedTotalBytes = total_bytes
            item.downloadedBytes = int(total_bytes * progress / 100)
        job.progress = progress
        job.speed = speed
        job.estimatedRemainingSeconds = eta
        job.downloadedBytes = item.downloadedBytes
        job.estimatedTotalBytes = item.estimatedTotalBytes
        db.commit()

    return handler


def _set_status(db, job: DownloadJob, item: Optional[DownloadItem], value: Status):
    job.status = value.value
    job.currentStep = value.value
    if item:
        item.status = value.value
    db.commit()


def _job_output_dir(job_id: str) -> str:
    path = os.path.join(settings.TEMP_DIR, job_id)
    os.makedirs(path, exist_ok=True)
    return path


def process_job(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(DownloadJob, job_id)
        if not job:
            logger.error("process_job: job %s not found", job_id)
            return

        job.startedAt = datetime.utcnow()
        db.commit()

        profile = _profile_for(db, job.selectedQuality)
        out_dir = _job_output_dir(job.id)

        for item in list(job.items):
            _process_item(db, job, item, profile, out_dir)

        failed = any(i.status == Status.FAILED.value for i in job.items)
        job.status = Status.FAILED.value if failed else Status.READY.value
        job.currentStep = job.status
        job.completedAt = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def _process_item(db, job: DownloadJob, item: DownloadItem, profile: DownloadProfile, out_dir: str) -> None:
    try:
        _set_status(db, job, item, Status.PREPARING)

        selector = build_format_selector(profile)
        part_template = os.path.join(out_dir, f"{item.id}.%(ext)s")
        source_url = f"https://www.youtube.com/watch?v={item.youtubeId}"

        args = [
            "yt-dlp",
            "--newline",
            "-f", selector,
            "--merge-output-format", profile.preferredContainer if not profile.audioOnly else "m4a",
            "-o", part_template,
            source_url,
        ]

        cookie_path = os.path.join(settings.COOKIE_DIR, "youtube_cookies.txt")
        if os.path.exists(cookie_path):
            args = args[:1] + ["--cookies", cookie_path] + args[1:]

        status_value = Status.DOWNLOADING_AUDIO if profile.audioOnly else Status.DOWNLOADING_VIDEO
        _set_status(db, job, item, status_value)
        handler = _make_progress_handler(db, item, job)
        returncode = ytdlp_runner.run_download(args, on_progress_line=handler)
        if returncode != 0:
            raise RuntimeError(f"yt-dlp exited with code {returncode}")

        produced = _find_produced_file(out_dir, item.id)
        if not produced:
            raise RuntimeError("yt-dlp did not produce an output file")

        final_name = sanitize_filename(item.title, default=item.youtubeId, extension=os.path.splitext(produced)[1])
        final_path = os.path.join(out_dir, f"{item.id}{os.path.splitext(produced)[1]}")
        if produced != final_path:
            os.replace(produced, final_path)

        needs_conversion, conversion_note = _plan_codec_compatibility(final_path, profile, selector)
        if needs_conversion:
            _set_status(db, job, item, Status.OPTIMIZING_FOR_IPHONE)
            final_path = _reencode_for_iphone(final_path, profile)

        _set_status(db, job, item, Status.FINALIZING)

        item.mediaPath = final_path
        item.fileName = final_name
        item.fileSize = os.path.getsize(final_path)
        item.mimeType = "audio/m4a" if profile.audioOnly else "video/mp4"
        item.conversionNote = conversion_note
        item.expiresAt = datetime.utcnow() + timedelta(hours=_get_retention_hours())

        _set_status(db, job, item, Status.READY)
    except Exception as exc:  # noqa: BLE001 - worker boundary, must not crash the loop
        logger.error("item %s failed: %s\n%s", item.id, exc, traceback.format_exc())
        item.status = Status.FAILED.value
        item.errorMessage = "Download failed. See server logs for details."
        job.errorMessage = item.errorMessage
        db.commit()
        _cleanup_partial_files(out_dir, item.id)


_COMPATIBLE_VIDEO_CODECS = {"h264", "avc1"}
_COMPATIBLE_AUDIO_CODECS = {"aac", "mp4a"}


def _plan_codec_compatibility(path: str, profile: DownloadProfile, selector: str) -> tuple[bool, str]:
    """Inspects the produced file's actual codecs and decides which of the three
    transparency states (§8) applies, and whether a re-encode is needed. Unknown
    codecs (ffprobe unavailable/failed) are treated as "leave it alone" rather
    than triggering an unnecessary re-encode."""
    was_merged = "+" in selector
    video_codec, audio_codec = ytdlp_runner.probe_codecs(path)

    if profile.audioOnly:
        if audio_codec is None or audio_codec in _COMPATIBLE_AUDIO_CODECS:
            return False, "no_conversion"
        return True, "converted_for_iphone"

    if video_codec is None and audio_codec is None:
        return False, ("merged_only" if was_merged else "no_conversion")

    compatible = (
        (video_codec is None or video_codec in _COMPATIBLE_VIDEO_CODECS)
        and (audio_codec is None or audio_codec in _COMPATIBLE_AUDIO_CODECS)
    )
    if compatible:
        return False, ("merged_only" if was_merged else "no_conversion")
    return True, "converted_for_iphone"


def _reencode_for_iphone(path: str, profile: DownloadProfile) -> str:
    converted_path = f"{os.path.splitext(path)[0]}.converted.mp4"
    if profile.audioOnly:
        args = ["ffmpeg", "-y", "-i", path, "-vn", "-c:a", "aac", converted_path]
    else:
        args = [
            "ffmpeg", "-y", "-i", path,
            "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart",
            converted_path,
        ]
    returncode = ytdlp_runner.run_ffmpeg(args)
    if returncode != 0 or not os.path.exists(converted_path):
        raise RuntimeError("ffmpeg re-encode for iPhone compatibility failed")
    os.remove(path)
    return converted_path


def _find_produced_file(out_dir: str, item_id: str) -> Optional[str]:
    for name in os.listdir(out_dir):
        if name.startswith(item_id) and not name.endswith(".part"):
            return os.path.join(out_dir, name)
    return None


def _cleanup_partial_files(out_dir: str, item_id: str) -> None:
    if not os.path.isdir(out_dir):
        return
    for name in os.listdir(out_dir):
        if name.startswith(item_id):
            try:
                os.remove(os.path.join(out_dir, name))
            except OSError:
                pass


def recover_stuck_jobs() -> int:
    """Run on worker startup: any job/item stuck in a non-terminal, actively-processing
    status when the worker died has no valid in-memory progress state left, so reset
    it to queued for RQ to pick up again rather than relying on RQ retry alone."""
    db = SessionLocal()
    try:
        in_progress_values = [s.value for s in IN_PROGRESS_STATUSES]
        stuck_jobs = db.execute(
            select(DownloadJob).where(DownloadJob.status.in_(in_progress_values))
        ).scalars().all()

        for job in stuck_jobs:
            job.status = Status.QUEUED.value
            job.currentStep = Status.QUEUED.value
            for item in job.items:
                if item.status in in_progress_values:
                    item.status = Status.QUEUED.value

        db.commit()
        return len(stuck_jobs)
    finally:
        db.close()
