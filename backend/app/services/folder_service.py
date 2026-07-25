from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.security import sanitize_filename
from app.models.folder import Folder


def get_or_create_folder(db: DBSession, name: str) -> Folder:
    """Resolves the shared Folder for a playlist/source display name.

    Keyed on the sanitized on-disk directory name (not the raw display name),
    so reusing the same playlist link - which yields the same title every
    time it's fetched - always lands in the same folder, both in the
    Mediathek and on the NAS, no matter which job or scheduler run created
    the item. Mirrors the directory-name derivation download_job.py already
    uses when writing files to TEMP_DIR.
    """
    dir_name = sanitize_filename(name, default="Playlist")
    existing = db.execute(select(Folder).where(Folder.dirName == dir_name)).scalar_one_or_none()
    if existing:
        return existing

    folder = Folder(name=name, dirName=dir_name)
    db.add(folder)
    db.flush()
    return folder
