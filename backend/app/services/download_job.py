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
from app.models.monitored_source import MonitoredSource
from app.models.status import IN_PROGRESS_STATUSES, Status
from app.services import ytdlp_runner
from app.services.format_selector import build_format_selector

logger = logging.getLogger("yt_pro.worker")

PROGRESS_RE = re.compile(
    r"\[download\]\s+(?P<percent>[\d.]+)%\s+of\s+~?\s*(?P<total>[\d.]+)(?P<total_unit>\w+)"
    r"(?:\s+at\s+(?P<speed>[\d.]+)(?P<speed_unit>\w+/s))?"
    r"(?:\s+ETA\s+(?P<eta>[\d:]+))?"
)

FFMPEG_TIME_RE = re.compile(r"time=(?P<h>\d+):(?P<m>\d+):(?P<s>[\d.]+)")

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


def _make_encode_progress_handler(db, item: DownloadItem, job: DownloadJob, duration_seconds: Optional[float]):
    """Same idea as _make_progress_handler but for the ffmpeg encode pass -
    without this, a long transcode (minutes, sometimes much longer than
    the source's own runtime on software-only encoding) left the progress
    bar frozen at the download phase's final value, which reads as "stuck"
    even though it's genuinely still working."""
    last_logged_pct = -1

    def handler(line: str):
        nonlocal last_logged_pct
        match = FFMPEG_TIME_RE.search(line)
        if not match:
            if line.strip():
                logger.info("ffmpeg[%s]: %s", item.id, line.strip())
            return
        if not duration_seconds or duration_seconds <= 0:
            return

        elapsed = (
            int(match.group("h")) * 3600 + int(match.group("m")) * 60 + float(match.group("s"))
        )
        pct = max(0.0, min(100.0, (elapsed / duration_seconds) * 100))

        item.progress = pct
        job.progress = pct
        db.commit()

        logged_pct = int(pct)
        if logged_pct != last_logged_pct and logged_pct % 10 == 0:
            last_logged_pct = logged_pct
            logger.info("ffmpeg[%s]: encoding %.0f%%", item.id, pct)

    return handler


def _set_status(db, job: DownloadJob, item: Optional[DownloadItem], value: Status):
    job.status = value.value
    job.currentStep = value.value
    if item:
        item.status = value.value
    db.commit()


def _job_output_dir(db, job: DownloadJob, item: DownloadItem) -> str:
    """One shared folder per playlist/source, instead of one folder per
    individual file - a monitored source's downloads reuse the same folder
    across separate scheduler runs (stable name = grouping over time), a
    manual playlist download's items share one folder named after the
    playlist, and anything else (a single manual video) keeps today's
    per-job folder. Filenames within a folder are always item-UUID-based
    (see _process_item), so multiple jobs safely sharing one folder can
    never collide."""
    folder_name = job.id
    if item.monitoredSourceId:
        source = db.get(MonitoredSource, item.monitoredSourceId)
        if source and source.name:
            folder_name = sanitize_filename(source.name, default=job.id)
    elif job.sourceType == "playlist" and job.title:
        folder_name = sanitize_filename(job.title, default=job.id)

    path = os.path.join(settings.TEMP_DIR, folder_name)
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

        if profile.videoBitrateKbps is not None:
            # Profile mandates an exact encode target - always transcode to
            # it regardless of what yt-dlp produced, so output size/bitrate
            # stays consistent across wildly different source encodes.
            _set_status(db, job, item, Status.OPTIMIZING_FOR_IPHONE)
            final_path = _encode_to_profile_spec(db, job, item, final_path, profile)
            conversion_note = "converted_for_iphone"
        else:
            needs_conversion, conversion_note = _plan_codec_compatibility(final_path, profile, selector)
            if needs_conversion:
                _set_status(db, job, item, Status.OPTIMIZING_FOR_IPHONE)
                final_path = _reencode_for_iphone(db, job, item, final_path, profile)

        _set_status(db, job, item, Status.FINALIZING)

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


_COMPATIBLE_VIDEO_CODECS = {"h264", "avc1", "hevc", "h265"}
_COMPATIBLE_AUDIO_CODECS = {"aac", "mp4a"}

_ENCODER_BY_CODEC = {"hevc": "libx265", "h265": "libx265", "h264": "libx264", "avc1": "libx264"}


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


def _reencode_for_iphone(db, job: DownloadJob, item: DownloadItem, path: str, profile: DownloadProfile) -> str:
    converted_path = f"{os.path.splitext(path)[0]}.converted.mp4"
    if profile.audioOnly:
        args = ["ffmpeg", "-y", "-i", path, "-vn", "-c:a", "aac", converted_path]
    else:
        args = [
            "ffmpeg", "-y", "-i", path,
            "-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart",
            converted_path,
        ]
    duration = ytdlp_runner.probe_duration(path)
    handler = _make_encode_progress_handler(db, item, job, duration)
    returncode = ytdlp_runner.run_ffmpeg(args, on_progress_line=handler)
    if returncode != 0 or not os.path.exists(converted_path):
        raise RuntimeError("ffmpeg re-encode for iPhone compatibility failed")
    os.remove(path)
    return converted_path


def _encode_to_profile_spec(db, job: DownloadJob, item: DownloadItem, path: str, profile: DownloadProfile) -> str:
    """Transcodes to the profile's exact target spec (codec, bitrate, fps,
    pixel format) - used for profiles that mandate a fixed output size
    rather than "just make it playable" (see _reencode_for_iphone for that
    lighter-touch path, still used by "original")."""
    converted_path = f"{os.path.splitext(path)[0]}.encoded.mp4"
    encoder = _ENCODER_BY_CODEC.get(profile.preferredVideoCodec or "", "libx265")
    # "fast" trades a little compression efficiency for meaningfully quicker
    # encoding - since -b:v pins the output size regardless of preset, the
    # only real cost is slightly lower quality at that fixed bitrate, not a
    # bigger file. Software x265 default ("medium") was the main reason a
    # single video's encode step could run far longer than its own runtime.
    args = [
        "ffmpeg", "-y", "-i", path,
        "-c:v", encoder,
        "-preset", "fast",
        "-b:v", f"{profile.videoBitrateKbps}k",
        "-pix_fmt", profile.pixelFormat or "yuv420p",
        "-c:a", "aac",
        "-b:a", f"{profile.audioBitrateKbps or 128}k",
        "-ac", "2",
        "-movflags", "+faststart",
    ]
    if profile.maxFps:
        # A ceiling, not a floor - yt-dlp already selected a source at/under
        # this resolution, but doesn't guarantee fps, so this still matters
        # for e.g. 60fps source clips.
        args += ["-r", str(profile.maxFps)]
    args.append(converted_path)

    duration = ytdlp_runner.probe_duration(path)
    handler = _make_encode_progress_handler(db, item, job, duration)
    returncode = ytdlp_runner.run_ffmpeg(args, on_progress_line=handler)
    if returncode != 0 or not os.path.exists(converted_path):
        raise RuntimeError("ffmpeg encode to target profile failed")
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
