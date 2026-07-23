from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.status import TERMINAL_STATUSES, Status


class DuplicateJobError(Exception):
    def __init__(self, existing_job_id: str):
        self.existing_job_id = existing_job_id
        super().__init__(f"Duplicate job: {existing_job_id}")


def find_duplicate_job(db: DBSession, user_id: str, source_url: str, quality: str) -> Optional[DownloadJob]:
    terminal_values = [s.value for s in TERMINAL_STATUSES]
    return db.execute(
        select(DownloadJob)
        .where(DownloadJob.userId == user_id)
        .where(DownloadJob.sourceUrl == source_url)
        .where(DownloadJob.selectedQuality == quality)
        .where(DownloadJob.status.notin_(terminal_values))
    ).scalars().first()


def create_job(
    db: DBSession,
    user_id: str,
    source_url: str,
    source_type: str,
    quality: str,
    items: list[dict],
    *,
    title: Optional[str] = None,
    monitored_source_id: Optional[str] = None,
    is_automatically_prepared: bool = False,
) -> DownloadJob:
    existing = find_duplicate_job(db, user_id, source_url, quality)
    if existing:
        raise DuplicateJobError(existing.id)

    job = DownloadJob(
        userId=user_id,
        sourceUrl=source_url,
        sourceType=source_type,
        title=title,
        selectedQuality=quality,
        status=Status.QUEUED.value,
        currentStep=Status.QUEUED.value,
    )
    db.add(job)
    db.flush()

    for entry in items:
        db.add(
            DownloadItem(
                jobId=job.id,
                youtubeId=entry["youtubeId"],
                title=entry.get("title") or entry["youtubeId"],
                channelName=entry.get("channelName"),
                thumbnailPath=entry.get("thumbnailPath"),
                duration=entry.get("duration"),
                selectedQuality=quality,
                status=Status.QUEUED.value,
                monitoredSourceId=monitored_source_id,
                isAutomaticallyPrepared=is_automatically_prepared,
            )
        )

    db.commit()
    db.refresh(job)
    return job
