from __future__ import annotations

import os
import re
import zipfile
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_csrf
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.playback_progress import PlaybackProgress
from app.models.status import Status
from app.models.user import User
from app.schemas.library import KeepUpdateRequest, ProgressOut, ProgressUpdateRequest
from app.services.streaming_guard import active_stream

# Per spec §15.4: a video counts as "completed" once nearly fully watched, not
# only at exactly 100%, so scrubbing back a few seconds at the end doesn't
# un-complete it.
COMPLETION_PERCENTAGE_THRESHOLD = 95.0
COMPLETION_REMAINING_SECONDS_THRESHOLD = 30.0

router = APIRouter(prefix="/api", tags=["downloads"])

RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


def _get_owned_item(db: DBSession, item_id: str, user: User) -> DownloadItem:
    item = db.get(DownloadItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    job = db.get(DownloadJob, item.jobId)
    if not job or job.userId != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    if item.deletedFromServerAt is not None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="File no longer available")
    if item.expiresAt and item.expiresAt < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="File has expired")

    return item


def _iter_range(path: str, start: int, end: int, chunk_size: int = 1024 * 1024):
    with open(path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = f.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.get("/items/{item_id}/download")
def download_item(
    item_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = _get_owned_item(db, item_id, user)
    if not item.mediaPath or not os.path.exists(item.mediaPath):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="File no longer available")

    file_size = os.path.getsize(item.mediaPath)
    headers = {
        "Content-Disposition": f'attachment; filename="{item.fileName or "download"}"',
        "Accept-Ranges": "bytes",
    }
    mime_type = item.mimeType or "application/octet-stream"

    range_header = request.headers.get("range")

    if range_header:
        match = RANGE_RE.match(range_header)
        if match:
            start_s, end_s = match.groups()
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
            end = min(end, file_size - 1)

            def ranged_gen():
                with active_stream(db, item):
                    yield from _iter_range(item.mediaPath, start, end)

            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            headers["Content-Length"] = str(end - start + 1)
            return StreamingResponse(
                ranged_gen(), status_code=status.HTTP_206_PARTIAL_CONTENT, headers=headers, media_type=mime_type
            )

    def full_gen():
        with active_stream(db, item):
            yield from _iter_range(item.mediaPath, 0, file_size - 1)

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(full_gen(), headers=headers, media_type=mime_type)


@router.get("/items/{item_id}/stream")
def stream_item(
    item_id: str,
    request: Request,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Player-facing counterpart to /download: same ownership/expiry/Range
    handling, but inline disposition (no attachment filename) for <video>."""
    item = _get_owned_item(db, item_id, user)
    if not item.mediaPath or not os.path.exists(item.mediaPath):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="File no longer available")

    item.lastStreamedAt = datetime.utcnow()
    db.commit()

    file_size = os.path.getsize(item.mediaPath)
    headers = {"Accept-Ranges": "bytes"}
    mime_type = item.mimeType or "application/octet-stream"

    range_header = request.headers.get("range")

    if range_header:
        match = RANGE_RE.match(range_header)
        if match:
            start_s, end_s = match.groups()
            start = int(start_s) if start_s else 0
            end = int(end_s) if end_s else file_size - 1
            end = min(end, file_size - 1)

            def ranged_gen():
                with active_stream(db, item):
                    yield from _iter_range(item.mediaPath, start, end)

            headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            headers["Content-Length"] = str(end - start + 1)
            return StreamingResponse(
                ranged_gen(), status_code=status.HTTP_206_PARTIAL_CONTENT, headers=headers, media_type=mime_type
            )

    def full_gen():
        with active_stream(db, item):
            yield from _iter_range(item.mediaPath, 0, file_size - 1)

    headers["Content-Length"] = str(file_size)
    return StreamingResponse(full_gen(), headers=headers, media_type=mime_type)


def _progress_out(progress: Optional[PlaybackProgress]) -> ProgressOut:
    if not progress:
        return ProgressOut()
    return ProgressOut.model_validate(progress, from_attributes=True)


def _get_progress_row(db: DBSession, item_id: str, user_id: str) -> Optional[PlaybackProgress]:
    return (
        db.query(PlaybackProgress)
        .filter(PlaybackProgress.downloadItemId == item_id, PlaybackProgress.userId == user_id)
        .one_or_none()
    )


@router.get("/items/{item_id}/progress", response_model=ProgressOut)
def get_progress(item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    _get_owned_item(db, item_id, user)
    return _progress_out(_get_progress_row(db, item_id, user.id))


@router.put("/items/{item_id}/progress", response_model=ProgressOut, dependencies=[Depends(require_csrf)])
def update_progress(
    item_id: str,
    body: ProgressUpdateRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_owned_item(db, item_id, user)
    progress = _get_progress_row(db, item_id, user.id)
    if not progress:
        progress = PlaybackProgress(downloadItemId=item_id, userId=user.id)
        db.add(progress)

    progress.positionSeconds = body.positionSeconds
    progress.durationSeconds = body.durationSeconds
    progress.playbackRate = body.playbackRate
    progress.percentage = (
        min(100.0, max(0.0, (body.positionSeconds / body.durationSeconds) * 100.0))
        if body.durationSeconds
        else 0.0
    )
    remaining = (body.durationSeconds - body.positionSeconds) if body.durationSeconds else None
    progress.completed = progress.percentage >= COMPLETION_PERCENTAGE_THRESHOLD or (
        remaining is not None and remaining < COMPLETION_REMAINING_SECONDS_THRESHOLD
    )
    progress.lastPlayedAt = datetime.utcnow()
    db.commit()
    db.refresh(progress)
    return _progress_out(progress)


@router.post("/items/{item_id}/progress/reset", response_model=ProgressOut, dependencies=[Depends(require_csrf)])
def reset_progress(item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    _get_owned_item(db, item_id, user)
    progress = _get_progress_row(db, item_id, user.id)
    if progress:
        db.delete(progress)
        db.commit()
    return ProgressOut()


@router.post("/items/{item_id}/mark-watched", response_model=ProgressOut, dependencies=[Depends(require_csrf)])
def mark_watched(item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    _get_owned_item(db, item_id, user)
    progress = _get_progress_row(db, item_id, user.id)
    if not progress:
        progress = PlaybackProgress(downloadItemId=item_id, userId=user.id)
        db.add(progress)
    progress.completed = True
    progress.percentage = 100.0
    if progress.durationSeconds:
        progress.positionSeconds = progress.durationSeconds
    progress.lastPlayedAt = datetime.utcnow()
    db.commit()
    db.refresh(progress)
    return _progress_out(progress)


@router.put("/items/{item_id}/keep", dependencies=[Depends(require_csrf)])
def update_keep(
    item_id: str,
    body: KeepUpdateRequest,
    db: DBSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = _get_owned_item(db, item_id, user)
    item.keepOnServer = body.keep
    db.commit()
    return {"id": item.id, "keepOnServer": item.keepOnServer}


def _zip_path(job_id: str) -> str:
    return os.path.join(settings.TEMP_DIR, job_id, "bundle.zip")


@router.post("/items/{item_id}/zip")
def create_zip(item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _get_owned_item(db, item_id, user)
    job = db.get(DownloadJob, item.jobId)
    siblings = [i for i in job.items]

    if any(i.status != Status.READY.value for i in siblings):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Not all items in the job are ready")

    zip_path = _zip_path(job.id)
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)

    total_size = sum(i.fileSize or 0 for i in siblings)
    warning = total_size > 2 * 1024 * 1024 * 1024

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zf:
        for i in siblings:
            if i.mediaPath and os.path.exists(i.mediaPath):
                zf.write(i.mediaPath, arcname=i.fileName or f"{i.id}.mp4")

    return {"jobId": job.id, "zipPath": zip_path, "largeSizeWarning": warning, "totalBytes": total_size}


@router.get("/items/{item_id}/zip/download")
def download_zip(item_id: str, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = _get_owned_item(db, item_id, user)
    job = db.get(DownloadJob, item.jobId)
    zip_path = _zip_path(job.id)
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zip not built yet")
    return FileResponse(zip_path, filename="download.zip", media_type="application/zip")
