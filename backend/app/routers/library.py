from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.monitored_source import MonitoredSource
from app.models.monitored_source_item import MonitoredSourceItem
from app.models.playback_progress import PlaybackProgress
from app.models.status import Status
from app.models.user import User
from app.schemas.library import LibraryItemOut, LibraryProgressOut

router = APIRouter(prefix="/api/library", tags=["library"])

# "In the library" = fully prepared media meant for playback/download, i.e.
# ready or already saved to the device -- excludes anything still in-flight,
# failed, cancelled, or expired (those stay visible in /api/history instead).
LIBRARY_STATUSES = [Status.READY.value, Status.DOWNLOADED_TO_DEVICE.value]

_EXPIRING_SOON_WINDOW = timedelta(hours=24)

_SORT_COLUMNS = {
    "newest": DownloadItem.createdAt.desc(),
    "oldest": DownloadItem.createdAt.asc(),
    "title": DownloadItem.title.asc(),
    "size": DownloadItem.fileSize.desc(),
    "duration": DownloadItem.duration.desc(),
}


@router.get("", response_model=list[LibraryItemOut])
def get_library(
    status: Optional[str] = None,
    origin: Optional[str] = None,
    sourceId: Optional[str] = None,
    quality: Optional[str] = None,
    sort: Optional[str] = None,
    query: Optional[str] = None,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (
        select(DownloadItem)
        .join(DownloadJob, DownloadItem.jobId == DownloadJob.id)
        .where(DownloadJob.userId == user.id)
        .where(DownloadItem.status.in_(LIBRARY_STATUSES))
        .where(DownloadItem.deletedFromServerAt.is_(None))
    )

    if origin == "manual":
        q = q.where(DownloadItem.isAutomaticallyPrepared.is_(False))
    elif origin == "automatic":
        q = q.where(DownloadItem.isAutomaticallyPrepared.is_(True))

    if sourceId:
        q = q.where(DownloadItem.monitoredSourceId == sourceId)
    if quality:
        q = q.where(DownloadItem.selectedQuality == quality)
    if query:
        like = f"%{query}%"
        q = q.where((DownloadItem.title.ilike(like)) | (DownloadItem.channelName.ilike(like)))

    # "last-watched" and "published" depend on data joined in below (progress /
    # monitored source item), so those two are applied as a Python post-sort;
    # everything else sorts in SQL.
    sql_sort = sort if sort in _SORT_COLUMNS else "newest"
    q = q.order_by(_SORT_COLUMNS[sql_sort])
    items = db.execute(q).scalars().all()

    source_names: dict[str, str] = {}
    source_ids = {i.monitoredSourceId for i in items if i.monitoredSourceId}
    if source_ids:
        rows = db.execute(select(MonitoredSource.id, MonitoredSource.name).where(MonitoredSource.id.in_(source_ids)))
        source_names = {row.id: row.name for row in rows}

    published_at_by_item: dict[str, datetime] = {}
    item_ids = [i.id for i in items]
    if item_ids:
        rows = db.execute(
            select(MonitoredSourceItem.downloadItemId, MonitoredSourceItem.publishedAt).where(
                MonitoredSourceItem.downloadItemId.in_(item_ids)
            )
        )
        published_at_by_item = {row.downloadItemId: row.publishedAt for row in rows if row.publishedAt}

    progress_by_item: dict[str, PlaybackProgress] = {}
    if item_ids:
        rows = (
            db.query(PlaybackProgress)
            .filter(PlaybackProgress.userId == user.id)
            .filter(PlaybackProgress.downloadItemId.in_(item_ids))
            .all()
        )
        progress_by_item = {p.downloadItemId: p for p in rows}

    results = []
    for item in items:
        progress_row = progress_by_item.get(item.id)
        progress_out = (
            LibraryProgressOut(
                positionSeconds=progress_row.positionSeconds,
                percentage=progress_row.percentage,
                completed=progress_row.completed,
            )
            if progress_row
            else None
        )

        if status == "new" and progress_row is not None:
            continue
        if status == "started" and (progress_row is None or progress_row.completed):
            continue
        if status == "watched" and (progress_row is None or not progress_row.completed):
            continue
        if status == "auto-prepared" and not item.isAutomaticallyPrepared:
            continue
        if status == "expiring-soon" and (
            item.keepOnServer or not item.expiresAt or item.expiresAt > datetime.utcnow() + _EXPIRING_SOON_WINDOW
        ):
            continue

        results.append(
            LibraryItemOut(
                id=item.id,
                title=item.title,
                channelName=item.channelName,
                thumbnailPath=item.thumbnailPath,
                duration=item.duration,
                selectedQuality=item.selectedQuality,
                fileSize=item.fileSize,
                mimeType=item.mimeType,
                status=item.status,
                isAutomaticallyPrepared=item.isAutomaticallyPrepared,
                sourceName=source_names.get(item.monitoredSourceId) if item.monitoredSourceId else None,
                publishedAt=published_at_by_item.get(item.id),
                createdAt=item.createdAt,
                expiresAt=item.expiresAt,
                keepOnServer=item.keepOnServer,
                progress=progress_out,
            )
        )

    if sort == "last-watched":
        results.sort(
            key=lambda r: progress_by_item[r.id].lastPlayedAt
            if progress_by_item.get(r.id) and progress_by_item[r.id].lastPlayedAt
            else datetime.min,
            reverse=True,
        )
    elif sort == "published":
        results.sort(key=lambda r: r.publishedAt or datetime.min, reverse=True)

    return results
