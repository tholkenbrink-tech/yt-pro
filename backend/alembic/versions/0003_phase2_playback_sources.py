"""phase 2: playback progress, monitored sources, library additive columns

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-21

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "monitored_sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("sourceUrl", sa.String(2048), nullable=False),
        sa.Column("sourceType", sa.String(32), nullable=False),
        sa.Column("externalPlaylistId", sa.String(128), nullable=True),
        sa.Column("playlistTitle", sa.String(512), nullable=True),
        sa.Column("thumbnailUrl", sa.String(1024), nullable=True),
        sa.Column("downloadProfileId", sa.String(36), sa.ForeignKey("download_profiles.id"), nullable=False),
        sa.Column("mode", sa.String(32), nullable=False),
        sa.Column("scheduleType", sa.String(32), nullable=False),
        sa.Column("cronExpression", sa.String(128), nullable=True),
        sa.Column("maximumNewItemsPerRun", sa.Integer(), nullable=True),
        sa.Column("maximumBytesPerRun", sa.Integer(), nullable=True),
        sa.Column("maximumDurationSeconds", sa.Integer(), nullable=True),
        sa.Column("includeShorts", sa.Boolean(), nullable=False),
        sa.Column("includeLivestreams", sa.Boolean(), nullable=False),
        sa.Column("includePastLivestreams", sa.Boolean(), nullable=False),
        sa.Column("onlyPublishedAfter", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retentionPolicy", sa.String(32), nullable=True),
        sa.Column("notificationsEnabled", sa.Boolean(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("checking", sa.Boolean(), nullable=False),
        sa.Column("lastCheckedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lastSuccessfulCheckAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("nextCheckAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lastError", sa.String(1024), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "monitored_source_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("monitoredSourceId", sa.String(36), sa.ForeignKey("monitored_sources.id"), nullable=False),
        sa.Column("youtubeId", sa.String(64), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("thumbnailUrl", sa.String(1024), nullable=True),
        sa.Column("channelName", sa.String(255), nullable=True),
        sa.Column("publishedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("durationSeconds", sa.Integer(), nullable=True),
        sa.Column("estimatedFileSize", sa.Integer(), nullable=True),
        sa.Column("discoveredAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("downloadItemId", sa.String(36), sa.ForeignKey("download_items.id"), nullable=True),
        sa.Column("ignoredAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_monitored_source_items_source_yt",
        "monitored_source_items",
        ["monitoredSourceId", "youtubeId"],
        unique=True,
    )

    op.create_table(
        "source_check_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("monitoredSourceId", sa.String(36), sa.ForeignKey("monitored_sources.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("startedAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("itemsFound", sa.Integer(), nullable=False),
        sa.Column("newItemsFound", sa.Integer(), nullable=False),
        sa.Column("itemsQueued", sa.Integer(), nullable=False),
        sa.Column("itemsSkippedCap", sa.Integer(), nullable=False),
        sa.Column("estimatedBytes", sa.Integer(), nullable=True),
        sa.Column("errorMessage", sa.String(1024), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "playback_progress",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("downloadItemId", sa.String(36), sa.ForeignKey("download_items.id"), nullable=False),
        sa.Column("positionSeconds", sa.Float(), nullable=False),
        sa.Column("durationSeconds", sa.Float(), nullable=True),
        sa.Column("percentage", sa.Float(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("playbackRate", sa.Float(), nullable=False),
        sa.Column("lastPlayedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_playback_progress_user_item",
        "playback_progress",
        ["userId", "downloadItemId"],
        unique=True,
    )

    with op.batch_alter_table("download_items") as batch_op:
        batch_op.add_column(sa.Column("sourceType", sa.String(32), nullable=False, server_default="video"))
        batch_op.add_column(sa.Column("monitoredSourceId", sa.String(36), nullable=True))
        batch_op.create_foreign_key(
            "fk_download_items_monitored_source_id",
            "monitored_sources",
            ["monitoredSourceId"],
            ["id"],
        )
        batch_op.add_column(sa.Column("originalPlaylistId", sa.String(128), nullable=True))
        batch_op.add_column(
            sa.Column("isAutomaticallyPrepared", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column("retentionPolicy", sa.String(32), nullable=True))
        batch_op.add_column(sa.Column("keepOnServer", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("lastStreamedAt", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("download_items") as batch_op:
        batch_op.drop_column("lastStreamedAt")
        batch_op.drop_column("keepOnServer")
        batch_op.drop_column("retentionPolicy")
        batch_op.drop_column("isAutomaticallyPrepared")
        batch_op.drop_column("originalPlaylistId")
        batch_op.drop_constraint("fk_download_items_monitored_source_id", type_="foreignkey")
        batch_op.drop_column("monitoredSourceId")
        batch_op.drop_column("sourceType")

    op.drop_index("ix_playback_progress_user_item", table_name="playback_progress")
    op.drop_table("playback_progress")
    op.drop_table("source_check_runs")
    op.drop_index("ix_monitored_source_items_source_yt", table_name="monitored_source_items")
    op.drop_table("monitored_source_items")
    op.drop_table("monitored_sources")
