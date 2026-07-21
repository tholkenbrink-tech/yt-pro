from __future__ import annotations

from app.models.download_item import DownloadItem
from app.services.job_service import create_job


def _make_item(db_session, test_user, youtube_id="prog1"):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url=f"https://youtube.com/watch?v={youtube_id}",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": youtube_id, "title": "Progress Video"}],
    )
    return db_session.query(DownloadItem).filter_by(jobId=job.id).one()


def test_progress_defaults_when_missing(auth_client, db_session, test_user):
    item = _make_item(db_session, test_user, "prog1")
    resp = auth_client.get(f"/api/items/{item.id}/progress")
    assert resp.status_code == 200
    body = resp.json()
    assert body["positionSeconds"] == 0.0
    assert body["completed"] is False


def test_progress_save_and_update(auth_client, db_session, test_user):
    item = _make_item(db_session, test_user, "prog2")
    resp = auth_client.put(
        f"/api/items/{item.id}/progress",
        json={"positionSeconds": 30.0, "durationSeconds": 100.0, "playbackRate": 1.5},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["percentage"] == 30.0
    assert body["completed"] is False
    assert body["playbackRate"] == 1.5

    resp2 = auth_client.put(
        f"/api/items/{item.id}/progress",
        json={"positionSeconds": 96.0, "durationSeconds": 100.0, "playbackRate": 1.0},
    )
    body2 = resp2.json()
    assert body2["completed"] is True  # >= 95%


def test_progress_completed_when_within_30s_of_end(auth_client, db_session, test_user):
    item = _make_item(db_session, test_user, "prog3")
    resp = auth_client.put(
        f"/api/items/{item.id}/progress",
        json={"positionSeconds": 4000.0, "durationSeconds": 4020.0, "playbackRate": 1.0},
    )
    body = resp.json()
    assert body["completed"] is True


def test_progress_reset(auth_client, db_session, test_user):
    item = _make_item(db_session, test_user, "prog4")
    auth_client.put(
        f"/api/items/{item.id}/progress",
        json={"positionSeconds": 30.0, "durationSeconds": 100.0, "playbackRate": 1.0},
    )
    resp = auth_client.post(f"/api/items/{item.id}/progress/reset")
    assert resp.status_code == 200
    body = resp.json()
    assert body["positionSeconds"] == 0.0
    assert body["completed"] is False

    check = auth_client.get(f"/api/items/{item.id}/progress")
    assert check.json()["positionSeconds"] == 0.0


def test_mark_watched(auth_client, db_session, test_user):
    item = _make_item(db_session, test_user, "prog5")
    resp = auth_client.post(f"/api/items/{item.id}/mark-watched")
    assert resp.status_code == 200
    body = resp.json()
    assert body["completed"] is True
    assert body["percentage"] == 100.0
