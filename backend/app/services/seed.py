from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.security import hash_password
from app.models.download_job import DownloadJob
from app.models.monitored_source import MonitoredSource
from app.models.playback_progress import PlaybackProgress
from app.models.session import Session as SessionModel
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


def merge_duplicate_users(db: DBSession) -> None:
    """Collapse users that only differ by letter case into one row.

    Before login became case-insensitive, a differently-cased row (e.g.
    "Thorben") could coexist with the lowercase hard-coded seed row
    ("thorben"), since the old seeding check compared names exactly. Both
    then show up as separate entries in the Mediathek/Verlauf owner filter
    (its display label capitalizes the name, making the duplicates look
    identical). This merges each such group into the account with the most
    download history, moving every foreign-key reference over before
    deleting the emptied-out duplicate(s).
    """
    users = db.execute(select(User)).scalars().all()
    groups: dict[str, list[User]] = defaultdict(list)
    for u in users:
        groups[u.name.lower()].append(u)

    for group in groups.values():
        if len(group) < 2:
            continue

        job_counts = {
            u.id: db.execute(
                select(DownloadJob.id).where(DownloadJob.userId == u.id)
            ).scalars().all()
            for u in group
        }
        # Most download history wins, then earliest account.
        keeper = sorted(
            group, key=lambda u: (-len(job_counts[u.id]), u.createdAt)
        )[0]

        for loser in group:
            if loser.id == keeper.id:
                continue

            db.execute(
                DownloadJob.__table__.update()
                .where(DownloadJob.userId == loser.id)
                .values(userId=keeper.id)
            )
            db.execute(
                MonitoredSource.__table__.update()
                .where(MonitoredSource.userId == loser.id)
                .values(userId=keeper.id)
            )
            db.execute(
                SessionModel.__table__.delete().where(SessionModel.userId == loser.id)
            )

            keeper_progress_items = {
                row.downloadItemId
                for row in db.execute(
                    select(PlaybackProgress).where(PlaybackProgress.userId == keeper.id)
                ).scalars().all()
            }
            loser_progress = db.execute(
                select(PlaybackProgress).where(PlaybackProgress.userId == loser.id)
            ).scalars().all()
            for progress in loser_progress:
                if progress.downloadItemId in keeper_progress_items:
                    # Keeper already has progress for this item - the
                    # unique (userId, downloadItemId) index forbids two
                    # rows, so drop the duplicate rather than overwrite
                    # potentially newer progress.
                    db.delete(progress)
                else:
                    progress.userId = keeper.id

            db.delete(loser)

    db.commit()


def seed_users(db: DBSession) -> None:
    """On every boot, create any hard-coded user that doesn't exist yet."""
    existing_names = {name.lower() for name in db.execute(select(User.name)).scalars().all()}
    for entry in HARDCODED_USERS:
        if entry["name"].lower() in existing_names:
            continue
        db.add(User(name=entry["name"], passwordHash=hash_password(entry["password"])))
    db.commit()
