from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.security import hash_password
from app.models.user import User

# Hard-coded family accounts - this is a single-household deployment with no
# self-registration, so credentials live in code rather than behind a DB reset
# or admin UI. Add a name here to add a family member; existing users are
# never touched (their password stays whatever was seeded, even if this list
# changes later).
HARDCODED_USERS = [
    {"name": "thorben", "password": "neo666"},
    {"name": "indie", "password": "neo666"},
    {"name": "tamara", "password": "neo666"},
]


def seed_users(db: DBSession) -> None:
    """On every boot, create any hard-coded user that doesn't exist yet."""
    existing_names = set(db.execute(select(User.name)).scalars().all())
    for entry in HARDCODED_USERS:
        if entry["name"] in existing_names:
            continue
        db.add(User(name=entry["name"], passwordHash=hash_password(entry["password"])))
    db.commit()
