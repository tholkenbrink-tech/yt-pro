from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy.orm import Session as DBSession

from app.models.download_item import DownloadItem


@contextmanager
def active_stream(db: DBSession, item: DownloadItem):
    """Increments DownloadItem.activeStreams for the duration of a file stream so
    the scheduler never deletes a file mid-transfer. DB-column based (not an
    in-process dict) so it also works across worker/API process boundaries."""
    item.activeStreams += 1
    db.commit()
    try:
        yield
    finally:
        item.activeStreams = max(0, item.activeStreams - 1)
        db.commit()
