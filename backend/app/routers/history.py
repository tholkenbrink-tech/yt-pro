from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_csrf
from app.core.queue import enqueue_download_job
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.status import Status
from app.models.user import User
from app.schemas.jobs import DownloadItemOut
from app.services.job_service import DuplicateJobError, create_job

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=list[DownloadItemOut])
def get_history(
    q: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(DownloadItem)
        .join(DownloadJob, DownloadItem.jobId == DownloadJob.id)
        .where(DownloadJob.userId == user.id)
    )
    if status_filter:
        query = query.where(DownloadItem.status == status_filter)
    if q:
        like = f"%{q}%"
        query = query.where((DownloadItem.title.ilike(like)) | (DownloadItem.channelName.ilike(like)))

    items = db.execute(query.order_by(DownloadItem.createdAt.desc())).scalars().all()
    return [DownloadItemOut.model_validate(i) for i in items]


def _get_owned_item(db: DBSession, item_id: str, user: User) -> DownloadItem:
    item = db.get(DownloadItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    job = db.get(DownloadJob, item.jobId)
    if not job or job.userId != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return item


@router.delete("/{item_id}", dependencies=[Depends(require_csrf)])
def delete_history_item(item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _get_owned_item(db, item_id, user)
    if item.mediaPath and os.path.exists(item.mediaPath):
        os.remove(item.mediaPath)
    db.delete(item)
    db.commit()
    return {"detail": "deleted"}


@router.post("/{item_id}/reprepare", dependencies=[Depends(require_csrf)])
def reprepare(item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _get_owned_item(db, item_id, user)
    job = db.get(DownloadJob, item.jobId)

    try:
        new_job = create_job(
            db,
            user_id=user.id,
            source_url=job.sourceUrl,
            source_type=job.sourceType,
            quality=item.selectedQuality,
            items=[{"youtubeId": item.youtubeId, "title": item.title, "channelName": item.channelName}],
        )
    except DuplicateJobError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "A matching job is already in progress", "existingJobId": exc.existing_job_id},
        ) from exc
    enqueue_download_job(new_job.id)
    return {"jobId": new_job.id, "status": Status.QUEUED.value}
