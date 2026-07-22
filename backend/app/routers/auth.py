from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, get_current_user
from app.core.security import new_token, verify_password
from app.core.limiter import limiter
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas.auth import LoginRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

COOKIE_KWARGS = dict(httponly=True, secure=True, samesite="none", path="/")


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, response: Response, body: LoginRequest, db: DBSession = Depends(get_db)):
    user = db.execute(select(User).where(User.name == body.username)).scalar_one_or_none()
    if not user or not verify_password(body.password, user.passwordHash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    session_id = new_token()
    expires_at = datetime.utcnow() + timedelta(hours=settings.SESSION_TTL_HOURS)
    db.add(SessionModel(id=session_id, userId=user.id, expiresAt=expires_at))
    db.commit()

    csrf_token = new_token(16)
    response.set_cookie(SESSION_COOKIE_NAME, session_id, max_age=settings.SESSION_TTL_HOURS * 3600, **COOKIE_KWARGS)
    csrf_kwargs = dict(httponly=False, secure=True, samesite="none", path="/")
    if settings.COOKIE_DOMAIN:
        csrf_kwargs["domain"] = settings.COOKIE_DOMAIN
    response.set_cookie(
        CSRF_COOKIE_NAME, csrf_token, max_age=settings.SESSION_TTL_HOURS * 3600, **csrf_kwargs
    )
    return UserOut.model_validate(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: DBSession = Depends(get_db)):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id:
        session = db.get(SessionModel, session_id)
        if session:
            db.delete(session)
            db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
    return {"detail": "logged out"}


@router.get("/session", response_model=UserOut)
def get_session(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)
