from __future__ import annotations

import os

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_csrf
from app.models.app_settings import SINGLETON_ID, AppSettings
from app.models.user import User
from app.schemas.storage import RetentionUpdateRequest, StorageOut
from app.services.disk import disk_usage_bytes

router = APIRouter(prefix="/api/storage", tags=["storage"])


def _get_or_create_settings(db: DBSession) -> AppSettings:
    row = db.get(AppSettings, SINGLETON_ID)
    if not row:
        # Default is "manual delete" (no automatic expiry) - files live on
        # the NAS, not in ephemeral storage, so auto-expiring them by
        # default surprised users who expected downloads to just stay put.
        row = AppSettings(id=SINGLETON_ID, retentionHours=None)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _used_temp_bytes() -> int:
    total = 0
    if os.path.isdir(settings.TEMP_DIR):
        for root, _dirs, files in os.walk(settings.TEMP_DIR):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    return total


@router.get("", response_model=StorageOut)
def get_storage(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    app_settings = _get_or_create_settings(db)
    free_bytes, _total = disk_usage_bytes(settings.TEMP_DIR if os.path.isdir(settings.TEMP_DIR) else "/")
    return StorageOut(
        usedBytes=_used_temp_bytes(),
        freeBytes=free_bytes,
        lowSpaceWarning=free_bytes < settings.MIN_FREE_DISK_BYTES,
        retentionHours=app_settings.retentionHours,
    )


@router.put("/retention", response_model=StorageOut, dependencies=[Depends(require_csrf)])
def update_retention(
    body: RetentionUpdateRequest, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    app_settings = _get_or_create_settings(db)
    app_settings.retentionHours = body.hours
    db.commit()
    return get_storage(db, user)
