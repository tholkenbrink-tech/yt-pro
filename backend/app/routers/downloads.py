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
from app.core.deps import get_current_user
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.status import Status
from app.models.user import User
from app.services.streaming_guard import active_stream

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
