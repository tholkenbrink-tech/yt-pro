"""seed download profiles

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-20

"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.profiles_seed import DOWNLOAD_PROFILES_SEED

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

download_profiles = sa.table(
    "download_profiles",
    sa.column("id", sa.String),
    sa.column("name", sa.String),
    sa.column("maximumResolution", sa.Integer),
    sa.column("audioOnly", sa.Boolean),
    sa.column("preferredContainer", sa.String),
    sa.column("preferredVideoCodec", sa.String),
    sa.column("preferredAudioCodec", sa.String),
    sa.column("enabled", sa.Boolean),
    sa.column("createdAt", sa.DateTime),
    sa.column("updatedAt", sa.DateTime),
)


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    rows = [
        {**profile, "id": str(uuid.uuid4()), "createdAt": now, "updatedAt": now}
        for profile in DOWNLOAD_PROFILES_SEED
    ]
    op.bulk_insert(download_profiles, rows)


def downgrade() -> None:
    names = [p["name"] for p in DOWNLOAD_PROFILES_SEED]
    op.execute(download_profiles.delete().where(download_profiles.c.name.in_(names)))
