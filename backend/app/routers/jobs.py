from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.deps import get_current_user, require_csrf
from app.core.queue import get_queue
from app.models.download_job import DownloadJob
from app.models.status import TERMINAL_STATUSES, Status
from app.models.user import User
from app.schemas.jobs import CreateJobRequest, DownloadJobOut
from app.services.disk import has_enough_free_disk
from app.services.job_service import DuplicateJobError, create_job

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("", response_model=DownloadJobOut, dependencies=[Depends(require_csrf)])
def create(
    body: CreateJobRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not has_enough_free_disk(settings.TEMP_DIR if settings.TEMP_DIR else "/"):
        raise HTTPException(
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
            detail="Not enough free disk space to start a new download",
        )

    items = [{"youtubeId": iid, "title": iid} for iid in (body.itemIds or [])] or [
        {"youtubeId": body.url, "title": body.url}
    ]

    try:
        job = create_job(
            db,
            user_id=user.id,
            source_url=body.url,
            source_type=body.sourceType or "video",
            quality=body.selectedQuality,
            items=items,
        )
    except DuplicateJobError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "A matching job is already in progress", "existingJobId": exc.existing_job_id},
        ) from exc

    get_queue().enqueue("app.services.download_job.process_job", job.id, job_id=job.id)
    return DownloadJobOut.model_validate(job)


@router.get("", response_model=list[DownloadJobOut])
def list_jobs(
    status_filter: Optional[str] = None,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(DownloadJob).where(DownloadJob.userId == user.id)
    if status_filter:
        query = query.where(DownloadJob.status == status_filter)
    jobs = db.execute(query.order_by(DownloadJob.createdAt.desc())).scalars().all()
    return [DownloadJobOut.model_validate(j) for j in jobs]


def _get_owned_job(db: DBSession, job_id: str, user: User) -> DownloadJob:
    job = db.get(DownloadJob, job_id)
    if not job or job.userId != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.get("/{job_id}", response_model=DownloadJobOut)
def get_job(job_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    return DownloadJobOut.model_validate(_get_owned_job(db, job_id, user))


@router.post("/{job_id}/cancel", response_model=DownloadJobOut, dependencies=[Depends(require_csrf)])
def cancel_job(job_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    job = _get_owned_job(db, job_id, user)
    if job.status not in [s.value for s in TERMINAL_STATUSES]:
        job.status = Status.CANCELLED.value
        job.currentStep = Status.CANCELLED.value
        db.commit()
        db.refresh(job)
    return DownloadJobOut.model_validate(job)


@router.post("/{job_id}/retry", response_model=DownloadJobOut, dependencies=[Depends(require_csrf)])
def retry_job(job_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    job = _get_owned_job(db, job_id, user)
    job.status = Status.QUEUED.value
    job.currentStep = Status.QUEUED.value
    job.errorMessage = None
    job.progress = 0.0
    db.commit()
    db.refresh(job)
    get_queue().enqueue("app.services.download_job.process_job", job.id, job_id=job.id)
    return DownloadJobOut.model_validate(job)


async def _event_stream(job_id: str, user_id: str):
    last_payload: Optional[str] = None
    while True:
        db = SessionLocal()
        try:
            job = db.get(DownloadJob, job_id)
            if not job or job.userId != user_id:
                yield f"event: error\ndata: {json.dumps({'detail': 'not found'})}\n\n"
                return

            payload = json.dumps(DownloadJobOut.model_validate(job).model_dump(mode="json"))
            if payload != last_payload:
                yield f"data: {payload}\n\n"
                last_payload = payload

            if job.status in [s.value for s in TERMINAL_STATUSES]:
                return
        finally:
            db.close()
        await asyncio.sleep(1)


@router.get("/{job_id}/events")
async def job_events(job_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    _get_owned_job(db, job_id, user)  # 404 check up front, using the request-scoped session
    return StreamingResponse(_event_stream(job_id, user.id), media_type="text/event-stream")
