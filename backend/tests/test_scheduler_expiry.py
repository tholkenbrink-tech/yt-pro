from __future__ import annotations

import os
from datetime import datetime, timedelta

from app.core.config import settings
from app.models.download_item import DownloadItem
from app.services.job_service import create_job
from scheduler.run import expire_once


def _make_item_with_file(db_session, test_user, youtube_id: str, expires_delta: timedelta, active_streams: int = 0):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url=f"https://youtube.com/watch?v={youtube_id}",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": youtube_id, "title": "Expiry Test"}],
    )
    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()

    out_dir = os.path.join(settings.TEMP_DIR, job.id)
    os.makedirs(out_dir, exist_ok=True)
    media_path = os.path.join(out_dir, f"{item.id}.mp4")
    with open(media_path, "wb") as f:
        f.write(b"data")

    item.mediaPath = media_path
    item.expiresAt = datetime.utcnow() + expires_delta
    item.activeStreams = active_streams
    db_session.commit()
    return item


def test_expired_item_gets_deleted(db_session, test_user):
    item = _make_item_with_file(db_session, test_user, "exp1", timedelta(hours=-1))

    count = expire_once()
    assert count == 1

    db_session.expire_all()
    refreshed = db_session.get(DownloadItem, item.id)
    assert refreshed.deletedFromServerAt is not None
    assert not os.path.exists(item.mediaPath)


def test_expired_item_with_active_stream_is_not_deleted(db_session, test_user):
    item = _make_item_with_file(db_session, test_user, "exp2", timedelta(hours=-1), active_streams=1)

    count = expire_once()
    assert count == 0

    db_session.expire_all()
    refreshed = db_session.get(DownloadItem, item.id)
    assert refreshed.deletedFromServerAt is None
    assert os.path.exists(item.mediaPath)


def test_non_expired_item_is_not_deleted(db_session, test_user):
    item = _make_item_with_file(db_session, test_user, "exp3", timedelta(hours=1))

    count = expire_once()
    assert count == 0

    db_session.expire_all()
    refreshed = db_session.get(DownloadItem, item.id)
    assert refreshed.deletedFromServerAt is None
