"""add folders table and download_items.folderId, backfill existing groupings

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-25

Introduces a persisted Folder as the single source of truth for Mediathek/
NAS folder grouping, replacing the old scheme where the frontend grouped
items by jobId (a manual playlist re-download got its own jobId every time,
so reusing the same playlist link fragmented into multiple folder cards in
the Mediathek even though the files already shared one NAS directory, since
download_job.py derived the on-disk path straight from the sanitized title).

Folders are keyed on the sanitized directory name, matching exactly what
download_job.py already used to name NAS directories - so no NAS files are
moved by this migration, existing directories are simply given a stable
Folder row and every DownloadItem in them is linked to it.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.core.security import sanitize_filename

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("dirName", sa.String(255), nullable=False, unique=True),
        sa.Column("createdAt", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updatedAt", sa.DateTime(timezone=True), nullable=False),
    )

    with op.batch_alter_table("download_items") as batch_op:
        batch_op.add_column(sa.Column("folderId", sa.String(36), nullable=True))
        batch_op.create_foreign_key(
            "fk_download_items_folder_id", "folders", ["folderId"], ["id"]
        )

    _backfill_folders()


def _backfill_folders() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)

    folders = sa.table(
        "folders",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
        sa.column("dirName", sa.String),
        sa.column("createdAt", sa.DateTime),
        sa.column("updatedAt", sa.DateTime),
    )
    download_items = sa.table(
        "download_items",
        sa.column("id", sa.String),
        sa.column("jobId", sa.String),
        sa.column("monitoredSourceId", sa.String),
        sa.column("folderId", sa.String),
    )
    download_jobs = sa.table(
        "download_jobs",
        sa.column("id", sa.String),
        sa.column("title", sa.String),
        sa.column("sourceType", sa.String),
    )
    monitored_sources = sa.table(
        "monitored_sources",
        sa.column("id", sa.String),
        sa.column("name", sa.String),
    )

    dir_name_to_folder_id: dict[str, str] = {}

    def resolve_folder(name: str) -> str:
        dir_name = sanitize_filename(name, default="Playlist")
        existing = dir_name_to_folder_id.get(dir_name)
        if existing:
            return existing
        folder_id = str(uuid.uuid4())
        bind.execute(
            folders.insert().values(id=folder_id, name=name, dirName=dir_name, createdAt=now, updatedAt=now)
        )
        dir_name_to_folder_id[dir_name] = folder_id
        return folder_id

    # Automatic/monitored-source items: one folder per source, named after it -
    # matches the source.name-derived path _job_output_dir used before this.
    for source_id, source_name in bind.execute(
        sa.select(monitored_sources.c.id, monitored_sources.c.name)
    ).all():
        if not source_name:
            continue
        has_items = bind.execute(
            sa.select(download_items.c.id).where(download_items.c.monitoredSourceId == source_id).limit(1)
        ).first()
        if not has_items:
            continue
        folder_id = resolve_folder(source_name)
        bind.execute(
            download_items.update()
            .where(download_items.c.monitoredSourceId == source_id)
            .values(folderId=folder_id)
        )

    # Manual playlist items: one folder per distinct playlist job title - this
    # is what retroactively merges separate re-downloads of the same playlist
    # link into a single folder, since they already share a sanitized title.
    for job_id, title in bind.execute(
        sa.select(download_jobs.c.id, download_jobs.c.title)
        .where(download_jobs.c.sourceType == "playlist")
        .where(download_jobs.c.title.is_not(None))
    ).all():
        if not title:
            continue
        folder_id = resolve_folder(title)
        bind.execute(
            download_items.update()
            .where(download_items.c.jobId == job_id)
            .where(download_items.c.monitoredSourceId.is_(None))
            .values(folderId=folder_id)
        )


def downgrade() -> None:
    with op.batch_alter_table("download_items") as batch_op:
        batch_op.drop_constraint("fk_download_items_folder_id", type_="foreignkey")
        batch_op.drop_column("folderId")

    op.drop_table("folders")
