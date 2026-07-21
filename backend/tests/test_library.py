from __future__ import annotations

from app.models.download_item import DownloadItem
from app.models.status import Status
from app.services.job_service import create_job


def _make_library_item(db_session, test_user, youtube_id, *, automatic=False, title=None, keep=False):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url=f"https://youtube.com/watch?v={youtube_id}",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": youtube_id, "title": title or youtube_id, "channelName": "Chan"}],
        is_automatically_prepared=automatic,
    )
    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()
    item.status = Status.READY.value
    item.fileSize = 1000
    item.keepOnServer = keep
    db_session.commit()
    return item


def test_library_lists_ready_items(auth_client, db_session, test_user):
    _make_library_item(db_session, test_user, "lib1", title="Alpha Video")
    resp = auth_client.get("/api/library")
    assert resp.status_code == 200
    titles = [i["title"] for i in resp.json()]
    assert "Alpha Video" in titles


def test_library_excludes_non_ready_items(auth_client, db_session, test_user):
    job = create_job(
        db_session,
        user_id=test_user.id,
        source_url="https://youtube.com/watch?v=lib2",
        source_type="video",
        quality="720p",
        items=[{"youtubeId": "lib2", "title": "Not Ready"}],
    )
    item = db_session.query(DownloadItem).filter_by(jobId=job.id).one()
    assert item.status == Status.QUEUED.value

    resp = auth_client.get("/api/library")
    titles = [i["title"] for i in resp.json()]
    assert "Not Ready" not in titles


def test_library_origin_filter(auth_client, db_session, test_user):
    _make_library_item(db_session, test_user, "lib3", automatic=True, title="Auto Video")
    _make_library_item(db_session, test_user, "lib4", automatic=False, title="Manual Video")

    auto_resp = auth_client.get("/api/library", params={"origin": "automatic"})
    auto_titles = [i["title"] for i in auto_resp.json()]
    assert "Auto Video" in auto_titles
    assert "Manual Video" not in auto_titles

    manual_resp = auth_client.get("/api/library", params={"origin": "manual"})
    manual_titles = [i["title"] for i in manual_resp.json()]
    assert "Manual Video" in manual_titles
    assert "Auto Video" not in manual_titles


def test_library_search_by_title(auth_client, db_session, test_user):
    _make_library_item(db_session, test_user, "lib5", title="Searchable Unique Title")
    resp = auth_client.get("/api/library", params={"query": "Unique"})
    titles = [i["title"] for i in resp.json()]
    assert "Searchable Unique Title" in titles


def test_library_status_watched_filter(auth_client, db_session, test_user):
    item = _make_library_item(db_session, test_user, "lib6", title="Watched Video")
    auth_client.post(f"/api/items/{item.id}/mark-watched")

    resp = auth_client.get("/api/library", params={"status": "watched"})
    titles = [i["title"] for i in resp.json()]
    assert "Watched Video" in titles

    resp_new = auth_client.get("/api/library", params={"status": "new"})
    titles_new = [i["title"] for i in resp_new.json()]
    assert "Watched Video" not in titles_new


def test_library_sort_title(auth_client, db_session, test_user):
    _make_library_item(db_session, test_user, "lib7", title="Zebra")
    _make_library_item(db_session, test_user, "lib8", title="Alpha")
    resp = auth_client.get("/api/library", params={"sort": "title"})
    titles = [i["title"] for i in resp.json()]
    assert titles.index("Alpha") < titles.index("Zebra")


def test_keep_toggle(auth_client, db_session, test_user):
    item = _make_library_item(db_session, test_user, "lib9", title="Keep Video")
    resp = auth_client.put(f"/api/items/{item.id}/keep", json={"keep": True})
    assert resp.status_code == 200
    assert resp.json()["keepOnServer"] is True

    db_session.expire_all()
    refreshed = db_session.get(DownloadItem, item.id)
    assert refreshed.keepOnServer is True
