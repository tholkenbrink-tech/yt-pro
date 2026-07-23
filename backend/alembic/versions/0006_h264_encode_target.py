"""switch fixed-bitrate profiles' encode target from H.265 to H.264

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-23

H.265/libx265 software encoding proved impractically slow for real-length
videos (a single episode's encode step could run 30-60+ minutes even with a
faster preset). H.264/libx264 is 3-5x faster in software, universally
hardware-decodable on every iPhone, at the cost of larger files for the same
target bitrate - the better trade-off for typical episode-length content.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

download_profiles = sa.table(
    "download_profiles",
    sa.column("name", sa.String),
    sa.column("preferredVideoCodec", sa.String),
)


def upgrade() -> None:
    op.execute(
        download_profiles.update()
        .where(download_profiles.c.name.in_(["480p", "720p", "1080p"]))
        .values(preferredVideoCodec="h264")
    )


def downgrade() -> None:
    op.execute(
        download_profiles.update()
        .where(download_profiles.c.name.in_(["480p", "720p", "1080p"]))
        .values(preferredVideoCodec="hevc")
    )
