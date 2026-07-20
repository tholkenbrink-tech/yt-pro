from __future__ import annotations

import os
from datetime import datetime, timedelta

from app.core.config import settings
from app.models.download_item import DownloadItem
from app.services.job_service import create_job


def _make_ready_item(db_session, test_user, youtube_id="ready1", expired=False):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url=f"https://youtube.com/watch?v={youtube_id}",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": youtube_id, "title": "Ready Video"}],
    )
    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()

    out_dir = os.path.join(settings.TEMP_DIR, job.id)
    os.makedirs(out_dir, exist_ok=True)
    media_path = os.path.join(out_dir, f"{item.id}.mp4")
    with open(media_path, "wb") as f:
        f.write(b"0123456789")

    item.mediaPath = media_path
    item.fileName = "ready-video.mp4"
    item.mimeType = "video/mp4"
    item.fileSize = 10
    item.expiresAt = datetime.utcnow() + (timedelta(hours=-1) if expired else timedelta(hours=1))
    db_session.commit()
    return item


def test_download_requires_auth(client, db_session, test_user):
    item = _make_ready_item(db_session, test_user)
    resp = client.get(f"/api/items/{item.id}/download")
    assert resp.status_code == 401


def test_download_succeeds_with_valid_session(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="ready2")
    resp = auth_client.get(f"/api/items/{item.id}/download")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "video/mp4"
    assert "ready-video.mp4" in resp.headers["content-disposition"]
    assert resp.content == b"0123456789"


def test_download_returns_410_for_expired_item(auth_client, db_session, test_user):
    item = _make_ready_item(db_session, test_user, youtube_id="ready3", expired=True)
    resp = auth_client.get(f"/api/items/{item.id}/download")
    assert resp.status_code == 410
