from __future__ import annotations

import json
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
from app.models.monitored_source import MonitoredSource
from app.models.monitored_source_item import MonitoredSourceItem
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


def _get_retention_hours() -> Optional[int]:
    """None means "manual delete" (no automatic expiry) - the default, since
    files live on the NAS rather than in ephemeral storage."""
    db = SessionLocal()
    try:
        row = db.get(AppSettings, SINGLETON_ID)
        return row.retentionHours if row else None
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
            # Non-progress lines are yt-dlp's own warnings/errors -- surface them in the
            # worker log instead of silently dropping them, otherwise a failure only ever
            # shows the generic "yt-dlp exited with code N" with no way to diagnose why.
            if line.strip():
                logger.info("yt-dlp[%s]: %s", item.id, line.strip())
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


def _job_output_dir(db, job: DownloadJob, item: DownloadItem) -> str:
    """One shared folder per playlist/source - a monitored source's downloads
    reuse the same folder across separate scheduler runs (stable name =
    grouping over time), a manual playlist download's items share one folder
    named after the playlist. A single manual video gets no folder at all -
    it's placed directly in TEMP_DIR (see _process_item's finalization,
    which names it after the video title) so browsing the NAS share doesn't
    mean opening one UUID-named folder per video."""
    if item.monitoredSourceId:
        source = db.get(MonitoredSource, item.monitoredSourceId)
        if source and source.name:
            path = os.path.join(settings.TEMP_DIR, sanitize_filename(source.name, default=job.id))
            os.makedirs(path, exist_ok=True)
            return path
    elif job.sourceType == "playlist" and job.title:
        path = os.path.join(settings.TEMP_DIR, sanitize_filename(job.title, default=job.id))
        os.makedirs(path, exist_ok=True)
        return path

    os.makedirs(settings.TEMP_DIR, exist_ok=True)
    return settings.TEMP_DIR


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

        for item in list(job.items):
            out_dir = _job_output_dir(db, job, item)
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

        # A retry (manual, or recover_stuck_jobs after a worker restart) can
        # find a leftover file from the previous attempt still sitting here
        # (e.g. a merge yt-dlp never finished writing) - yt-dlp's own resume
        # heuristic then trusts it as "already downloaded" and skips
        # re-fetching, which fails later with a corrupt/incomplete file
        # ("moov atom not found"). Always start a fresh attempt from a clean
        # slate instead of relying on yt-dlp's resume detection here.
        _cleanup_partial_files(out_dir, item.id)

        selector = build_format_selector(profile)
        part_template = os.path.join(out_dir, f"{item.id}.%(ext)s")
        # Playlist items carry a bare video ID (parsed at analyze time), but
        # single-video jobs store the user-submitted URL as-is in youtubeId
        # (see jobs.py's create() fallback) - don't re-wrap an already full URL.
        source_url = (
            item.youtubeId
            if item.youtubeId.startswith(("http://", "https://"))
            else f"https://www.youtube.com/watch?v={item.youtubeId}"
        )

        args = [
            "yt-dlp",
            "--newline",
            "-f", selector,
            "--merge-output-format", profile.preferredContainer if not profile.audioOnly else "m4a",
            "--write-info-json",
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

        real_thumbnail = _consume_info_json_thumbnail(out_dir, item.id)
        if real_thumbnail:
            item.thumbnailPath = real_thumbnail
            linked_source_item = db.execute(
                select(MonitoredSourceItem).where(MonitoredSourceItem.downloadItemId == item.id)
            ).scalar_one_or_none()
            if linked_source_item:
                linked_source_item.thumbnailUrl = real_thumbnail

        produced = _find_produced_file(out_dir, item.id)
        if not produced:
            raise RuntimeError("yt-dlp did not produce an output file")

        # Kept UUID-named through the download step - only renamed to
        # something human-readable at the very end, once, below.
        final_path = os.path.join(out_dir, f"{item.id}{os.path.splitext(produced)[1]}")
        if produced != final_path:
            os.replace(produced, final_path)

        # No re-encode pass: offer the file yt-dlp/ffmpeg already produced
        # as-is (whatever codec/bitrate the source came in) rather than
        # transcoding for iPhone/profile-spec compatibility - that step
        # could take far longer than the download itself for marginal gain.
        was_merged = "+" in selector
        conversion_note = "merged_only" if was_merged else "no_conversion"

        _set_status(db, job, item, Status.FINALIZING)

        # Rename from the UUID working name to the video's title now that
        # processing is done, so browsing the NAS share directly (not just
        # through the app) is actually navigable.
        final_name = sanitize_filename(item.title, default=item.youtubeId, extension=os.path.splitext(final_path)[1])
        final_path = _finalize_media_path(out_dir, final_path, final_name, item.id)

        item.mediaPath = final_path
        item.fileName = final_name
        item.fileSize = os.path.getsize(final_path)
        item.mimeType = "audio/m4a" if profile.audioOnly else "video/mp4"
        item.conversionNote = conversion_note
        retention_hours = _get_retention_hours()
        item.expiresAt = (
            datetime.utcnow() + timedelta(hours=retention_hours) if retention_hours is not None else None
        )

        _set_status(db, job, item, Status.READY)
    except Exception as exc:  # noqa: BLE001 - worker boundary, must not crash the loop
        logger.error("item %s failed: %s\n%s", item.id, exc, traceback.format_exc())
        item.status = Status.FAILED.value
        item.errorMessage = "Download failed. See server logs for details."
        job.errorMessage = item.errorMessage
        db.commit()
        _cleanup_partial_files(out_dir, item.id)


def _finalize_media_path(out_dir: str, current_path: str, desired_name: str, item_id: str) -> str:
    """Moves the finished file from its UUID working name to desired_name
    (the sanitized video title). out_dir is now often shared by multiple
    items (a playlist/source folder, or TEMP_DIR itself for single videos),
    so a same-titled file already present there gets a short disambiguating
    suffix rather than silently overwriting it."""
    target = os.path.join(out_dir, desired_name)
    if os.path.exists(target):
        stem, ext = os.path.splitext(desired_name)
        target = os.path.join(out_dir, f"{stem}-{item_id[:8]}{ext}")
    os.replace(current_path, target)
    return target


def _find_produced_file(out_dir: str, item_id: str) -> Optional[str]:
    for name in os.listdir(out_dir):
        if name.startswith(item_id) and not name.endswith((".part", ".info.json")):
            return os.path.join(out_dir, name)
    return None


def _consume_info_json_thumbnail(out_dir: str, item_id: str) -> Optional[str]:
    """Reads the real per-video thumbnail out of the --write-info-json sidecar
    yt-dlp just produced (the actual extraction has full metadata, unlike the
    --flat-playlist listing used for source discovery, which mostly doesn't
    carry a thumbnail at all). Removes the sidecar file either way, since it's
    not meant to sit in the finished-media output directory."""
    info_path = os.path.join(out_dir, f"{item_id}.info.json")
    if not os.path.exists(info_path):
        return None
    try:
        with open(info_path, "r", encoding="utf-8") as f:
            info = json.load(f)
    except (OSError, json.JSONDecodeError):
        info = {}
    finally:
        try:
            os.remove(info_path)
        except OSError:
            pass

    thumbnail = info.get("thumbnail")
    if not thumbnail and info.get("thumbnails"):
        thumbnail = info["thumbnails"][-1].get("url")
    return thumbnail


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
    it to queued and re-enqueue it - the RQ job that was mid-flight when the worker
    process was killed is simply gone, resetting the DB status alone left these
    silently stuck forever with nothing to ever pick them back up."""
    from app.core.queue import enqueue_download_job

    db = SessionLocal()
    try:
        in_progress_values = [s.value for s in IN_PROGRESS_STATUSES]
        stuck_jobs = db.execute(
            select(DownloadJob).where(DownloadJob.status.in_(in_progress_values))
        ).scalars().all()

        job_ids = [job.id for job in stuck_jobs]
        for job in stuck_jobs:
            job.status = Status.QUEUED.value
            job.currentStep = Status.QUEUED.value
            for item in job.items:
                if item.status in in_progress_values:
                    item.status = Status.QUEUED.value

        db.commit()
    finally:
        db.close()

    for job_id in job_ids:
        enqueue_download_job(job_id)
    return len(job_ids)
