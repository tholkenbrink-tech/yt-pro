from __future__ import annotations

import os
from datetime import datetime, timedelta

from app.core.config import settings
from app.models.download_item import DownloadItem
from app.services.job_service import create_job

CONTENT = b"0123456789abcdefghij"  # 20 bytes


def _make_ready_item(db_session, test_user, youtube_id="stream1", expired=False):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url=f"https://youtube.com/watch?v={youtube_id}",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": youtube_id, "title": "Stream Video"}],
    )
    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()

    out_dir = os.path.join(settings.TEMP_DIR, job.id)
    os.makedirs(out_dir, exist_ok=True)
    media_path = os.path.join(out_dir, f"{item.id}.mp4")
    with open(media_path, "wb") as f:
        f.write(CONTENT)

    item.mediaPath = media_path
    item.fileName = "stream-video.mp4"
    item.mimeType = "video/mp4"
    item.fileSize = len(CONTENT)
    item.expiresAt = datetime.utcnow() + (timedelta(hours=-1) if expired else timedelta(hours=1))
    db_session.commit()
    return item


def test_stream_requires_auth(client, db_session, test_user):
    item = _make_ready_item(db_session, test_user)
    resp = client.get(f"/api/items/{item.id}/stream")
    assert resp.status_code == 401


def test_stream_full_request(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="stream2")
    resp = auth_client.get(f"/api/items/{item.id}/stream")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "video/mp4"
    assert "content-disposition" not in resp.headers
    assert resp.headers["accept-ranges"] == "bytes"
    assert resp.content == CONTENT

    db_session.expire_all()
    refreshed = db_session.get(DownloadItem, item.id)
    assert refreshed.lastStreamedAt is not None


def test_stream_single_range(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="stream3")
    resp = auth_client.get(f"/api/items/{item.id}/stream", headers={"Range": "bytes=2-5"})
    assert resp.status_code == 206
    assert resp.content == CONTENT[2:6]
    assert resp.headers["content-range"] == f"bytes 2-5/{len(CONTENT)}"


def test_stream_open_ended_range(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="stream4")
    resp = auth_client.get(f"/api/items/{item.id}/stream", headers={"Range": "bytes=10-"})
    assert resp.status_code == 206
    assert resp.content == CONTENT[10:]
    assert resp.headers["content-range"] == f"bytes 10-{len(CONTENT) - 1}/{len(CONTENT)}"


def test_stream_invalid_range_falls_back_to_full(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="stream5")
    resp = auth_client.get(f"/api/items/{item.id}/stream", headers={"Range": "not-a-range"})
    assert resp.status_code == 200
    assert resp.content == CONTENT


def test_stream_returns_410_for_deleted(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="stream6")
    item.deletedFromServerAt = datetime.utcnow()
    db_session.commit()
    resp = auth_client.get(f"/api/items/{item.id}/stream")
    assert resp.status_code == 410


def test_stream_returns_410_for_expired(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="stream7", expired=True)
    resp = auth_client.get(f"/api/items/{item.id}/stream")
    assert resp.status_code == 410
