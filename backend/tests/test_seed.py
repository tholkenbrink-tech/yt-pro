from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.models.download_job import DownloadJob
from app.models.user import User
from app.services.seed import HARDCODED_USERS, merge_duplicate_users, seed_users


def test_merge_duplicate_users_keeps_the_one_with_history(db_session):
    # Simulates the real incident: an old differently-cased admin account
    # ("Thorben", pre-existing, with real download history) plus a freshly
    # auto-seeded lowercase duplicate ("thorben", empty, from before the seed
    # check became case-insensitive).
    original = User(
        name="Thorben",
        passwordHash=hash_password("original-password"),
        createdAt=datetime.utcnow() - timedelta(days=30),
    )
    duplicate = User(name="thorben", passwordHash=hash_password("neo666"))
    db_session.add_all([original, duplicate])
    db_session.commit()
    db_session.refresh(original)
    db_session.refresh(duplicate)

    job = DownloadJob(
        userId=original.id,
        sourceUrl="https://youtube.com/watch?v=abc",
        sourceType="video",
        selectedQuality="720p",
    )
    db_session.add(job)
    db_session.commit()

    merge_duplicate_users(db_session)

    remaining = db_session.execute(select(User).where(User.name.ilike("thorben"))).scalars().all()
    assert len(remaining) == 1
    survivor = remaining[0]
    assert survivor.id == original.id
    assert survivor.passwordHash == original.passwordHash

    db_session.refresh(job)
    assert job.userId == original.id


def test_merge_then_reseed_does_not_recreate_duplicate(db_session):
    original = User(name="Thorben", passwordHash=hash_password("original-password"))
    duplicate = User(name="thorben", passwordHash=hash_password("neo666"))
    db_session.add_all([original, duplicate])
    db_session.commit()

    merge_duplicate_users(db_session)
    seed_users(db_session)

    names = {u.name.lower() for u in db_session.execute(select(User)).scalars().all()}
    assert names == {e["name"] for e in HARDCODED_USERS}
    assert len(db_session.execute(select(User)).scalars().all()) == len(HARDCODED_USERS)
