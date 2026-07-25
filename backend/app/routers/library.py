from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_csrf
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.folder import Folder
from app.models.monitored_source import MonitoredSource
from app.models.monitored_source_item import MonitoredSourceItem
from app.models.playback_progress import PlaybackProgress
from app.models.status import Status
from app.models.user import User
from app.schemas.library import (
    FolderOut,
    LibraryItemOut,
    LibraryProgressOut,
    MoveItemToFolderRequest,
    MoveItemToFolderResponse,
)

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
    userId: Optional[str] = None,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Family-shared Mediathek: default view is "what I downloaded", but any
    # family member can browse another member's downloads (userId=<id>) or
    # everyone's at once (userId=all) - there's no per-user privacy boundary
    # in this household, just a discovery filter.
    q = (
        select(DownloadItem)
        .join(DownloadJob, DownloadItem.jobId == DownloadJob.id)
        .where(DownloadItem.status.in_(LIBRARY_STATUSES))
        .where(DownloadItem.deletedFromServerAt.is_(None))
    )
    if userId == "all":
        pass
    elif userId:
        q = q.where(DownloadJob.userId == userId)
    else:
        q = q.where(DownloadJob.userId == user.id)

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

    folder_names: dict[str, str] = {}
    folder_ids = {i.folderId for i in items if i.folderId}
    if folder_ids:
        rows = db.execute(select(Folder.id, Folder.name).where(Folder.id.in_(folder_ids)))
        folder_names = {row.id: row.name for row in rows}

    job_titles: dict[str, str] = {}
    owner_by_job: dict[str, str] = {}
    job_ids = {i.jobId for i in items}
    if job_ids:
        rows = db.execute(
            select(DownloadJob.id, DownloadJob.title).where(DownloadJob.id.in_(job_ids), DownloadJob.title.is_not(None))
        )
        job_titles = {row.id: row.title for row in rows}

        rows = db.execute(
            select(DownloadJob.id, User.name)
            .join(User, DownloadJob.userId == User.id)
            .where(DownloadJob.id.in_(job_ids))
        )
        owner_by_job = {row.id: row.name for row in rows}

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
        if status == "downloaded-to-device" and item.status != Status.DOWNLOADED_TO_DEVICE.value:
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
                sourceId=item.monitoredSourceId,
                jobId=item.jobId,
                playlistTitle=job_titles.get(item.jobId),
                folderId=item.folderId,
                folderName=folder_names.get(item.folderId) if item.folderId else None,
                ownerName=owner_by_job.get(item.jobId),
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


@router.get("/folders", response_model=list[FolderOut])
def list_folders(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Folder.id, Folder.name, func.count(DownloadItem.id))
        .join(DownloadItem, DownloadItem.folderId == Folder.id)
        .group_by(Folder.id)
        .order_by(Folder.name)
    ).all()
    return [FolderOut(id=row[0], name=row[1], itemCount=row[2]) for row in rows]


@router.put(
    "/items/{item_id}/folder",
    response_model=MoveItemToFolderResponse,
    dependencies=[Depends(require_csrf)],
)
def move_item_to_folder(
    item_id: str,
    body: MoveItemToFolderRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Moves a standalone (not-yet-foldered) item into an existing folder,
    both in the Mediathek and physically on the NAS. Items already in a
    folder aren't handled here - that grouping is managed automatically via
    the playlist/source it came from."""
    item = db.get(DownloadItem, item_id)
    if not item or item.deletedFromServerAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    if item.folderId:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Item is already in a folder")
    if not item.mediaPath or not os.path.exists(item.mediaPath):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="File no longer available")

    folder = db.get(Folder, body.folderId)
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    folder_dir = os.path.join(settings.TEMP_DIR, folder.dirName)
    os.makedirs(folder_dir, exist_ok=True)

    file_name = item.fileName or os.path.basename(item.mediaPath)
    target = os.path.join(folder_dir, file_name)
    if os.path.exists(target):
        stem, ext = os.path.splitext(file_name)
        target = os.path.join(folder_dir, f"{stem}-{item.id[:8]}{ext}")

    os.replace(item.mediaPath, target)
    item.mediaPath = target
    item.fileName = os.path.basename(target)
    item.folderId = folder.id
    db.commit()

    return MoveItemToFolderResponse(id=item.id, folderId=folder.id, folderName=folder.name)
