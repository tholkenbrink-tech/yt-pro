"""redefine download profiles: fixed H.265 encode targets + Original quality

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-24

"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
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
    sa.column("videoBitrateKbps", sa.Integer),
    sa.column("audioBitrateKbps", sa.Integer),
    sa.column("maxFps", sa.Integer),
    sa.column("pixelFormat", sa.String),
    sa.column("createdAt", sa.DateTime),
    sa.column("updatedAt", sa.DateTime),
)


def upgrade() -> None:
    op.add_column("download_profiles", sa.Column("videoBitrateKbps", sa.Integer(), nullable=True))
    op.add_column("download_profiles", sa.Column("audioBitrateKbps", sa.Integer(), nullable=True))
    op.add_column("download_profiles", sa.Column("maxFps", sa.Integer(), nullable=True))
    op.add_column("download_profiles", sa.Column("pixelFormat", sa.String(16), nullable=True))

    # No longer offered as a fresh choice - disabled, not deleted, so
    # existing items' selectedQuality still reads sensibly.
    op.execute(
        download_profiles.update()
        .where(download_profiles.c.name.in_(["360p", "best"]))
        .values(enabled=False)
    )

    specs = {
        "480p": dict(videoBitrateKbps=160, audioBitrateKbps=48, maxFps=24),
        "720p": dict(videoBitrateKbps=850, audioBitrateKbps=80, maxFps=30),
        "1080p": dict(videoBitrateKbps=2100, audioBitrateKbps=96, maxFps=30),
    }
    for name, values in specs.items():
        op.execute(
            download_profiles.update()
            .where(download_profiles.c.name == name)
            .values(preferredVideoCodec="hevc", pixelFormat="yuv420p", **values)
        )

    conn = op.get_bind()
    exists = conn.execute(sa.text("SELECT 1 FROM download_profiles WHERE name = 'original'")).first()
    if not exists:
        now = datetime.now(timezone.utc)
        op.bulk_insert(
            download_profiles,
            [
                {
                    "id": str(uuid.uuid4()),
                    "name": "original",
                    "maximumResolution": 1080,
                    "audioOnly": False,
                    "preferredContainer": "mp4",
                    "preferredVideoCodec": None,
                    "preferredAudioCodec": "aac",
                    "enabled": True,
                    "videoBitrateKbps": None,
                    "audioBitrateKbps": None,
                    "maxFps": None,
                    "pixelFormat": None,
                    "createdAt": now,
                    "updatedAt": now,
                }
            ],
        )


def downgrade() -> None:
    op.execute(download_profiles.delete().where(download_profiles.c.name == "original"))
    op.execute(
        download_profiles.update()
        .where(download_profiles.c.name.in_(["360p", "best"]))
        .values(enabled=True)
    )
    op.drop_column("download_profiles", "pixelFormat")
    op.drop_column("download_profiles", "maxFps")
    op.drop_column("download_profiles", "audioBitrateKbps")
    op.drop_column("download_profiles", "videoBitrateKbps")
