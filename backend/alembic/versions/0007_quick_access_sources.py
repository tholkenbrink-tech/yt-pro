"""add isQuickAccess flag to monitored_sources

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-24

Marks a MonitoredSource as a manually-triggered "quick access" playlist
bookmark shown on the download page, as opposed to a scheduled automation
source shown under Settings > Sources. These always have mode=discover_only
and scheduleType=manual, so nothing about the scheduler/check pipeline
changes - this is purely a UI-facing grouping flag.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "monitored_sources",
        sa.Column("isQuickAccess", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("monitored_sources", "isQuickAccess")
