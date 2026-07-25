from __future__ import annotations

import os

from app.core.config import settings
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.status import Status
from app.services.job_service import create_job


def _playlist_payload(url: str, title: str) -> dict:
    return {
        "url": url,
        "selectedQuality": "720p",
        "sourceType": "playlist",
        "playlistTitle": title,
        "items": [
            {"youtubeId": "p1", "title": "Video 1"},
            {"youtubeId": "p2", "title": "Video 2"},
        ],
    }


def test_reusing_playlist_link_shares_one_folder(auth_client, db_session):
    payload = _playlist_payload("https://youtube.com/playlist?list=abc", "My Playlist")

    first = auth_client.post("/api/jobs", json=payload)
    assert first.status_code == 200
    first_job_id = first.json()["id"]

    # The duplicate-job guard only blocks a second identical URL while the
    # first is still in flight - mark it done to simulate "reuse this
    # playlist link again later", which is the scenario in question.
    job = db_session.get(DownloadJob, first_job_id)
    job.status = Status.READY.value
    db_session.commit()

    second = auth_client.post("/api/jobs", json=payload)
    assert second.status_code == 200
    second_job_id = second.json()["id"]
    assert second_job_id != first_job_id

    first_items = db_session.query(DownloadItem).filter_by(jobId=first_job_id).all()
    second_items = db_session.query(DownloadItem).filter_by(jobId=second_job_id).all()
    assert all(i.folderId for i in first_items)
    folder_ids = {i.folderId for i in [*first_items, *second_items]}
    assert len(folder_ids) == 1


def test_library_groups_reused_playlist_items_under_one_folder(auth_client, db_session):
    payload = _playlist_payload("https://youtube.com/playlist?list=xyz", "Another Playlist")

    first = auth_client.post("/api/jobs", json=payload)
    first_job_id = first.json()["id"]
    job = db_session.get(DownloadJob, first_job_id)
    job.status = Status.READY.value
    db_session.commit()

    second = auth_client.post("/api/jobs", json=payload)
    second_job_id = second.json()["id"]

    for job_id in (first_job_id, second_job_id):
        for item in db_session.query(DownloadItem).filter_by(jobId=job_id).all():
            item.status = Status.READY.value
    db_session.commit()

    resp = auth_client.get("/api/library")
    assert resp.status_code == 200
    body = resp.json()
    folder_ids = {i["folderId"] for i in body if i["title"] in ("Video 1", "Video 2")}
    assert len(folder_ids) == 1
    assert None not in folder_ids


def test_move_standalone_item_into_existing_folder(auth_client, db_session, test_user):
    # A standalone manual video, sitting directly in TEMP_DIR (no folder).
    standalone_job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=standalone1",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "standalone1", "title": "Loose Video"}],
    )
    standalone_item = db_session.query(DownloadItem).filter_by(jobId=standalone_job.id).one()
    standalone_item.status = Status.READY.value
    media_path = os.path.join(settings.TEMP_DIR, "Loose Video.mp4")
    with open(media_path, "wb") as f:
        f.write(b"fake video bytes")
    standalone_item.mediaPath = media_path
    standalone_item.fileName = "Loose Video.mp4"
    db_session.commit()

    # A playlist folder to move it into.
    playlist_payload = _playlist_payload("https://youtube.com/playlist?list=target", "Target Playlist")
    playlist_resp = auth_client.post("/api/jobs", json=playlist_payload)
    playlist_job_id = playlist_resp.json()["id"]
    playlist_item = db_session.query(DownloadItem).filter_by(jobId=playlist_job_id).first()
    folder_id = playlist_item.folderId
    assert folder_id

    resp = auth_client.put(f"/api/library/items/{standalone_item.id}/folder", json={"folderId": folder_id})
    assert resp.status_code == 200
    body = resp.json()
    assert body["folderId"] == folder_id
    assert body["folderName"] == "Target Playlist"

    db_session.expire_all()
    moved = db_session.get(DownloadItem, standalone_item.id)
    assert moved.folderId == folder_id
    assert not os.path.exists(media_path)
    assert os.path.exists(moved.mediaPath)
    assert os.path.dirname(moved.mediaPath) == os.path.join(settings.TEMP_DIR, "Target Playlist")


def test_move_item_already_in_folder_is_rejected(auth_client, db_session):
    payload = _playlist_payload("https://youtube.com/playlist?list=already", "Already Foldered")
    resp = auth_client.post("/api/jobs", json=payload)
    job_id = resp.json()["id"]
    item = db_session.query(DownloadItem).filter_by(jobId=job_id).first()
    item.status = Status.READY.value
    item.mediaPath = os.path.join(settings.TEMP_DIR, "Already Foldered", "a.mp4")
    os.makedirs(os.path.dirname(item.mediaPath), exist_ok=True)
    with open(item.mediaPath, "wb") as f:
        f.write(b"x")
    db_session.commit()

    other_folder_resp = auth_client.post(
        "/api/jobs", json=_playlist_payload("https://youtube.com/playlist?list=other", "Other Folder")
    )
    other_item = db_session.query(DownloadItem).filter_by(jobId=other_folder_resp.json()["id"]).first()

    move_resp = auth_client.put(
        f"/api/library/items/{item.id}/folder", json={"folderId": other_item.folderId}
    )
    assert move_resp.status_code == 409


def test_list_folders(auth_client, db_session):
    payload = _playlist_payload("https://youtube.com/playlist?list=listed", "Listed Playlist")
    auth_client.post("/api/jobs", json=payload)

    resp = auth_client.get("/api/library/folders")
    assert resp.status_code == 200
    names = [f["name"] for f in resp.json()]
    assert "Listed Playlist" in names
