"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-20

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("passwordHash", sa.String(255), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "download_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(32), nullable=False, unique=True),
        sa.Column("maximumResolution", sa.Integer(), nullable=True),
        sa.Column("audioOnly", sa.Boolean(), nullable=False),
        sa.Column("preferredContainer", sa.String(16), nullable=False),
        sa.Column("preferredVideoCodec", sa.String(16), nullable=True),
        sa.Column("preferredAudioCodec", sa.String(16), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "download_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("userId", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sourceUrl", sa.String(2048), nullable=False),
        sa.Column("sourceType", sa.String(32), nullable=False),
        sa.Column("selectedQuality", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("currentStep", sa.String(64), nullable=True),
        sa.Column("downloadedBytes", sa.Integer(), nullable=False),
        sa.Column("estimatedTotalBytes", sa.Integer(), nullable=True),
        sa.Column("speed", sa.Float(), nullable=True),
        sa.Column("estimatedRemainingSeconds", sa.Float(), nullable=True),
        sa.Column("errorMessage", sa.String(1024), nullable=True),
        sa.Column("startedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "download_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("jobId", sa.String(36), sa.ForeignKey("download_jobs.id"), nullable=False),
        sa.Column("youtubeId", sa.String(64), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("channelName", sa.String(255), nullable=True),
        sa.Column("thumbnailPath", sa.String(1024), nullable=True),
        sa.Column("duration", sa.Integer(), nullable=True),
        sa.Column("selectedQuality", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("progress", sa.Float(), nullable=False),
        sa.Column("mediaPath", sa.String(1024), nullable=True),
        sa.Column("fileName", sa.String(512), nullable=True),
        sa.Column("fileSize", sa.Integer(), nullable=True),
        sa.Column("mimeType", sa.String(64), nullable=True),
        sa.Column("conversionNote", sa.String(32), nullable=True),
        sa.Column("activeStreams", sa.Integer(), nullable=False),
        sa.Column("downloadedToDeviceAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deletedFromServerAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expiresAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("errorMessage", sa.String(1024), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "cookie_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("uploadedAt", sa.DateTime(timezone=True), nullable=True),
        sa.Column("filePathHint", sa.String(1024), nullable=True),
    )

    op.create_table(
        "app_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("retentionHours", sa.Integer(), nullable=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_table("cookie_configs")
    op.drop_table("download_items")
    op.drop_table("download_jobs")
    op.drop_table("download_profiles")
    op.drop_table("sessions")
    op.drop_table("users")
