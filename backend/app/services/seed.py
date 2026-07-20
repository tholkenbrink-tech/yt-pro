from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User


def seed_admin_user(db: DBSession) -> None:
    """On first boot, if the users table is empty, seed one user from env vars.
    Single-user system: there is no self-registration endpoint."""
    existing = db.execute(select(User).limit(1)).scalar_one_or_none()
    if existing:
        return

    user = User(
        name=settings.ADMIN_USERNAME,
        passwordHash=hash_password(settings.ADMIN_PASSWORD),
    )
    db.add(user)
    db.commit()
