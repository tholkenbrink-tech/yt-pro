from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_csrf
from app.models.cookie_config import CookieConfig
from app.models.status import CookieStatus
from app.models.user import User
from app.schemas.admin import CookieStatusOut

# Google OAuth login flow is explicitly out of scope; cookie import is the only
# supported auth-bypass mechanism for age/region-gated videos.
router = APIRouter(prefix="/api/admin", tags=["admin"])

COOKIE_FILENAME = "youtube_cookies.txt"
MAX_COOKIE_FILE_BYTES = 1024 * 1024


def _cookie_path() -> str:
    return os.path.join(settings.COOKIE_DIR, COOKIE_FILENAME)


def _get_or_create_row(db: DBSession) -> CookieConfig:
    row = db.query(CookieConfig).first()
    if not row:
        row = CookieConfig(status=CookieStatus.NOT_CONFIGURED.value)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _looks_like_netscape_cookiejar(content: bytes) -> bool:
    text = content.decode("utf-8", errors="ignore")
    if "# Netscape HTTP Cookie File" in text:
        return True
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if len(line.split("\t")) == 7:
            return True
    return False


@router.post("/cookies", response_model=CookieStatusOut, dependencies=[Depends(require_csrf)])
async def upload_cookies(
    file: UploadFile, db: DBSession = Depends(get_db), user: User = Depends(get_current_user)
):
    content = await file.read(MAX_COOKIE_FILE_BYTES + 1)
    if len(content) > MAX_COOKIE_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cookie file too large")
    if not _looks_like_netscape_cookiejar(content):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a valid Netscape cookies.txt file")

    os.makedirs(settings.COOKIE_DIR, exist_ok=True)
    path = _cookie_path()
    with open(path, "wb") as f:
        f.write(content)
    os.chmod(path, 0o600)

    row = _get_or_create_row(db)
    row.status = CookieStatus.VALID.value
    row.uploadedAt = datetime.utcnow()
    row.filePathHint = path
    db.commit()
    db.refresh(row)
    return CookieStatusOut.model_validate(row)


@router.delete("/cookies", response_model=CookieStatusOut, dependencies=[Depends(require_csrf)])
def delete_cookies(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    path = _cookie_path()
    if os.path.exists(path):
        os.remove(path)

    row = _get_or_create_row(db)
    row.status = CookieStatus.NOT_CONFIGURED.value
    row.filePathHint = None
    db.commit()
    db.refresh(row)
    return CookieStatusOut.model_validate(row)


@router.get("/cookies/status", response_model=CookieStatusOut)
def cookie_status(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    return CookieStatusOut.model_validate(_get_or_create_row(db))
