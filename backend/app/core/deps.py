from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.models.session import Session as SessionModel
from app.models.user import User

SESSION_COOKIE_NAME = "session_id"
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"


def get_current_user(
    session_id: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: DBSession = Depends(get_db),
) -> User:
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    session = db.get(SessionModel, session_id)
    if not session or session.expiresAt < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = db.get(User, session.userId)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return user


def require_csrf(
    request: Request,
    csrf_token: Optional[str] = Cookie(default=None, alias=CSRF_COOKIE_NAME),
) -> None:
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if not csrf_token or not header_token or csrf_token != header_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token missing or invalid")
