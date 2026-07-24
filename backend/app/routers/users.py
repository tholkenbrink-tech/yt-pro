from __future__ import annotations

from sqlalchemy import select
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import UserOut

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: DBSession = Depends(get_db), user: User = Depends(get_current_user)):
    """All family accounts, for the library/history "who downloaded this" filter.
    Everyone in this household can see everyone else's downloads."""
    users = db.execute(select(User).order_by(User.name)).scalars().all()
    return [UserOut.model_validate(u) for u in users]
