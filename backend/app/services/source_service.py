from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import update

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.download_profile import DownloadProfile
from app.models.monitored_source import MonitoredSource, MonitoredSourceMode, MonitoredSourceScheduleType
from app.models.monitored_source_item import MonitoredSourceItem, MonitoredSourceItemStatus
from app.models.source_check_run import SourceCheckRun, SourceCheckRunStatus
from app.services import ytdlp_runner
from app.services.job_service import DuplicateJobError, create_job

logger = logging.getLogger("yt_pro.source_service")

COOKIE_AUTH_ERROR = "YouTube-Anmeldung erforderlich"
# Rough bitrate-based estimate used only to evaluate maximumBytesPerRun caps --
# yt-dlp's flat-playlist dump does not return real file sizes.
_ESTIMATED_BYTES_PER_SECOND = 375_000
_DEFAULT_BACKOFF_SECONDS = 15 * 60
_MAX_BACKOFF_SECONDS = 24 * 60 * 60


def compute_next_check(
    schedule_type: str, cron_expression: Optional[str], from_time: datetime
) -> Optional[datetime]:
    if schedule_type == MonitoredSourceScheduleType.MANUAL:
        return None
    if schedule_type == MonitoredSourceScheduleType.EVERY_6H:
        return from_time + timedelta(hours=6)
    if schedule_type == MonitoredSourceScheduleType.EVERY_12H:
        return from_time + timedelta(hours=12)
    if schedule_type == MonitoredSourceScheduleType.DAILY:
        return from_time + timedelta(days=1)
    if schedule_type == MonitoredSourceScheduleType.WEEKLY:
        return from_time + timedelta(weeks=1)
    if schedule_type == MonitoredSourceScheduleType.CRON:
        if not cron_expression:
            return from_time + timedelta(days=1)
        try:
            return _cron_next(cron_expression, from_time)
        except ValueError:
            return from_time + timedelta(days=1)
    return from_time + timedelta(days=1)


def _cron_field_match(field: str, value: int) -> bool:
    if field == "*":
        return True
    for part in field.split(","):
        if "/" in part:
            base, _, step_s = part.partition("/")
            step = int(step_s)
            lo = 0 if base == "*" else int(base)
            if value >= lo and (value - lo) % step == 0:
                return True
        elif "-" in part:
            lo_s, hi_s = part.split("-")
            if int(lo_s) <= value <= int(hi_s):
                return True
        else:
            if int(part) == value:
                return True
    return False


def _cron_next(cron_expression: str, from_time: datetime, max_minutes: int = 60 * 24 * 366) -> datetime:
    """Minimal 5-field (minute hour day month weekday) cron-next-run search.
    Brute-forces minute-by-minute rather than pulling in a dependency -- fine
    for the run interval this app needs (checks at most every few minutes)."""
    fields = cron_expression.split()
    if len(fields) != 5:
        raise ValueError(f"Invalid cron expression: {cron_expression}")
    minute_f, hour_f, dom_f, month_f, dow_f = fields

    candidate = from_time.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(max_minutes):
        if (
            _cron_field_match(minute_f, candidate.minute)
            and _cron_field_match(hour_f, candidate.hour)
            and _cron_field_match(dom_f, candidate.day)
            and _cron_field_match(month_f, candidate.month)
            and _cron_field_match(dow_f, candidate.isoweekday() % 7)
        ):
            return candidate
        candidate += timedelta(minutes=1)
    raise ValueError(f"No match found for cron expression: {cron_expression}")


def _looks_like_short(entry: dict) -> bool:
    duration = entry.get("duration")
    return duration is not None and duration <= 60


def _parse_upload_date(entry: dict) -> Optional[datetime]:
    raw = entry.get("upload_date")  # yt-dlp format: YYYYMMDD
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y%m%d")
    except ValueError:
        return None


def _is_cookie_auth_error(message: str) -> bool:
    lowered = message.lower()
    return "sign in" in lowered or "login" in lowered or "cookies" in lowered or "private" in lowered


def _acquire_lock(db, source_id: str) -> bool:
    result = db.execute(
        update(MonitoredSource)
        .where(MonitoredSource.id == source_id)
        .where(MonitoredSource.checking.is_(False))
        .values(checking=True)
    )
    db.commit()
    return result.rowcount == 1


def _release_lock(db, source_id: str) -> None:
    db.execute(update(MonitoredSource).where(MonitoredSource.id == source_id).values(checking=False))
    db.commit()


def compute_source_status(source: MonitoredSource, has_pending_items: bool) -> str:
    if not source.enabled:
        return "paused"
    if source.checking:
        return "checking"
    if source.lastError == COOKIE_AUTH_ERROR:
        return "authRequired"
    if source.lastError:
        return "failed"
    if has_pending_items:
        return "newItems"
    if source.lastCheckedAt is not None:
        return "noChanges"
    return "active"


def _backoff_next_check(source: MonitoredSource) -> datetime:
    now = datetime.utcnow()
    previous_interval = _DEFAULT_BACKOFF_SECONDS
    if source.lastCheckedAt and source.nextCheckAt:
        previous_interval = max(
            int((source.nextCheckAt - source.lastCheckedAt).total_seconds()), _DEFAULT_BACKOFF_SECONDS
        )
    backoff = min(previous_interval * 2, _MAX_BACKOFF_SECONDS)
    return now + timedelta(seconds=backoff)


async def check_source(source_id: str) -> Optional[SourceCheckRun]:
    """Core monitored-source check, run both by the scheduler tick and by the
    check-now endpoint. Uses its own DB session (not request-scoped) so it works
    the same from either caller, and an atomic checking-flag compare-and-set so
    the two callers can never process the same source concurrently."""
    db = SessionLocal()
    try:
        source = db.get(MonitoredSource, source_id)
        if not source:
            return None

        if not _acquire_lock(db, source_id):
            logger.info("source %s already being checked, skipping", source_id)
            return None

        run = SourceCheckRun(monitoredSourceId=source_id, status=SourceCheckRunStatus.RUNNING)
        db.add(run)
        db.commit()
        db.refresh(run)

        try:
            await _run_check(db, source, run)
            run.status = SourceCheckRunStatus.COMPLETED
            run.completedAt = datetime.utcnow()
            source.lastError = None
            source.lastSuccessfulCheckAt = datetime.utcnow()
            source.nextCheckAt = compute_next_check(
                source.scheduleType, source.cronExpression, datetime.utcnow()
            )
        except Exception as exc:  # noqa: BLE001 - must not crash the scheduler loop
            logger.error("source %s check failed: %s", source_id, exc)
            message = str(exc)[:1024]
            if _is_cookie_auth_error(message):
                message = COOKIE_AUTH_ERROR
            run.status = SourceCheckRunStatus.FAILED
            run.completedAt = datetime.utcnow()
            run.errorMessage = message
            source.lastError = message
            source.nextCheckAt = _backoff_next_check(source)
        finally:
            source.lastCheckedAt = datetime.utcnow()
            db.commit()
            _release_lock(db, source_id)

        db.refresh(run)
        return run
    finally:
        db.close()


async def _run_check(db, source: MonitoredSource, run: SourceCheckRun) -> None:
    data = await ytdlp_runner.dump_json(source.sourceUrl, flat_playlist=True)
    entries = list(data.get("entries") or ([data] if data.get("id") else []))
    run.itemsFound = len(entries)

    profile = db.get(DownloadProfile, source.downloadProfileId)
    if not profile:
        raise ValueError(f"Unknown download profile: {source.downloadProfileId}")

    existing_youtube_ids = {
        row.youtubeId
        for row in db.query(MonitoredSourceItem.youtubeId)
        .filter(MonitoredSourceItem.monitoredSourceId == source.id)
        .all()
    }

    new_items = 0
    queued = 0
    skipped_cap = 0
    estimated_bytes_total = 0
    cap_hit = False

    for entry in entries:
        youtube_id = entry.get("id")
        if not youtube_id or youtube_id in existing_youtube_ids:
            continue

        if cap_hit:
            skipped_cap += 1
            continue

        if not source.includeShorts and _looks_like_short(entry):
            continue

        live_status = entry.get("live_status")
        if live_status in ("is_live", "is_upcoming") and not source.includeLivestreams:
            continue
        if live_status == "was_live" and not source.includePastLivestreams:
            continue

        duration = entry.get("duration")
        if source.maximumDurationSeconds and duration and duration > source.maximumDurationSeconds:
            continue

        published_at = _parse_upload_date(entry)
        if source.onlyPublishedAfter and published_at and published_at < source.onlyPublishedAfter:
            continue

        estimated_size = int(duration * _ESTIMATED_BYTES_PER_SECOND) if duration else None

        if source.maximumNewItemsPerRun and new_items >= source.maximumNewItemsPerRun:
            cap_hit = True
            skipped_cap += 1
            continue
        if (
            source.maximumBytesPerRun
            and estimated_size
            and estimated_bytes_total + estimated_size > source.maximumBytesPerRun
        ):
            cap_hit = True
            skipped_cap += 1
            continue

        item_status = MonitoredSourceItemStatus.DISCOVERED
        if source.mode == MonitoredSourceMode.CONFIRM_FIRST:
            item_status = MonitoredSourceItemStatus.AWAITING_CONFIRMATION

        source_item = MonitoredSourceItem(
            monitoredSourceId=source.id,
            youtubeId=youtube_id,
            title=entry.get("title") or youtube_id,
            thumbnailUrl=entry.get("thumbnail"),
            channelName=entry.get("channel") or entry.get("uploader"),
            publishedAt=published_at,
            durationSeconds=duration,
            estimatedFileSize=estimated_size,
            status=item_status,
        )
        db.add(source_item)
        db.flush()
        existing_youtube_ids.add(youtube_id)
        new_items += 1
        if estimated_size:
            estimated_bytes_total += estimated_size

        if source.mode == MonitoredSourceMode.AUTO_PREPARE:
            _prepare_item(db, source, source_item, profile)
            queued += 1

    run.newItemsFound = new_items
    run.itemsQueued = queued
    run.itemsSkippedCap = skipped_cap
    run.estimatedBytes = estimated_bytes_total or None
    db.commit()


def _prepare_item(db, source: MonitoredSource, source_item: MonitoredSourceItem, profile: DownloadProfile) -> None:
    try:
        job = create_job(
            db,
            user_id=source.userId,
            source_url=f"https://www.youtube.com/watch?v={source_item.youtubeId}",
            source_type="video",
            quality=profile.name,
            items=[
                {
                    "youtubeId": source_item.youtubeId,
                    "title": source_item.title,
                    "channelName": source_item.channelName,
                    "thumbnailPath": source_item.thumbnailUrl,
                    "duration": source_item.durationSeconds,
                }
            ],
            monitored_source_id=source.id,
            is_automatically_prepared=True,
        )
    except DuplicateJobError:
        source_item.status = MonitoredSourceItemStatus.QUEUED
        db.commit()
        return

    download_item = job.items[0] if job.items else None
    source_item.status = MonitoredSourceItemStatus.QUEUED
    source_item.downloadItemId = download_item.id if download_item else None
    db.commit()

    from app.core.queue import get_queue

    get_queue().enqueue("app.services.download_job.process_job", job.id, job_id=job.id)
