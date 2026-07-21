from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.models.download_profile import DownloadProfile
from app.models.monitored_source import MonitoredSource
from app.models.monitored_source_item import MonitoredSourceItem, MonitoredSourceItemStatus
from app.services import source_service, ytdlp_runner
from scheduler.run import check_due_sources_once


class DummyQueue:
    def enqueue(self, *args, **kwargs):
        return None


def _profile_id(db_session) -> str:
    return db_session.query(DownloadProfile).filter_by(name="720p").one().id


def _playlist_payload(n=3, duration=120):
    entries = [
        {"id": f"vid{i}", "title": f"Video {i}", "duration": duration, "channel": "Chan"} for i in range(n)
    ]
    return {"_type": "playlist", "id": "PL123", "title": "My Playlist", "entries": entries}


def _make_async(payload):
    async def _fake(url, flat_playlist=False, cookies_path=None):
        return payload

    return _fake


def _record_call(bucket):
    async def _fake(source_id):
        bucket.append(source_id)
        return None

    return _fake


def _make_source(db_session, test_user, **overrides) -> MonitoredSource:
    defaults = dict(
        userId=test_user.id,
        name="Test Source",
        sourceUrl="https://youtube.com/playlist?list=PL123",
        sourceType="playlist",
        downloadProfileId=_profile_id(db_session),
        mode="discover_only",
        scheduleType="manual",
        checking=False,
        enabled=True,
    )
    defaults.update(overrides)
    source = MonitoredSource(**defaults)
    db_session.add(source)
    db_session.commit()
    db_session.refresh(source)
    return source


def test_create_source(auth_client, db_session, test_user, monkeypatch):
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload()))
    resp = auth_client.post(
        "/api/sources",
        json={
            "sourceUrl": "https://youtube.com/playlist?list=PL123",
            "name": "My Source",
            "downloadProfileId": _profile_id(db_session),
            "mode": "discover_only",
            "scheduleType": "manual",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["playlistTitle"] == "My Playlist"
    assert body["computedStatus"] == "active"


def test_analyze_as_source(auth_client, db_session, monkeypatch):
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload(n=5)))
    resp = auth_client.post("/api/sources/analyze", json={"url": "https://youtube.com/playlist?list=PL123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["itemCount"] == 5
    assert body["playlistTitle"] == "My Playlist"


@pytest.mark.asyncio
async def test_check_now_discovers_new_items(db_session, test_user, monkeypatch):
    source = _make_source(db_session, test_user)
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload(n=3)))

    run = await source_service.check_source(source.id)
    assert run.status == "completed"
    assert run.newItemsFound == 3

    items = db_session.query(MonitoredSourceItem).filter_by(monitoredSourceId=source.id).all()
    assert len(items) == 3
    assert all(i.status == MonitoredSourceItemStatus.DISCOVERED for i in items)


@pytest.mark.asyncio
async def test_second_check_has_no_duplicates(db_session, test_user, monkeypatch):
    source = _make_source(db_session, test_user)
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload(n=3)))

    await source_service.check_source(source.id)
    db_session.expire_all()
    refreshed = db_session.get(MonitoredSource, source.id)
    refreshed.checking = False
    db_session.commit()

    run2 = await source_service.check_source(source.id)
    assert run2.newItemsFound == 0

    items = db_session.query(MonitoredSourceItem).filter_by(monitoredSourceId=source.id).all()
    assert len(items) == 3


@pytest.mark.asyncio
async def test_maximum_new_items_cap(db_session, test_user, monkeypatch):
    source = _make_source(db_session, test_user, maximumNewItemsPerRun=2)
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload(n=5)))

    run = await source_service.check_source(source.id)
    assert run.newItemsFound == 2
    assert run.itemsSkippedCap == 3

    items = db_session.query(MonitoredSourceItem).filter_by(monitoredSourceId=source.id).all()
    assert len(items) == 2


@pytest.mark.asyncio
async def test_maximum_bytes_cap(db_session, test_user, monkeypatch):
    # 120s * 375000 B/s ~= 45MB per item; cap after first item.
    source = _make_source(db_session, test_user, maximumBytesPerRun=50_000_000)
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload(n=5, duration=120)))

    run = await source_service.check_source(source.id)
    assert run.newItemsFound == 1
    assert run.itemsSkippedCap == 4


@pytest.mark.asyncio
async def test_auto_prepare_mode_creates_download_job(db_session, test_user, monkeypatch):
    source = _make_source(db_session, test_user, mode="auto_prepare")
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload(n=1)))
    monkeypatch.setattr("app.core.queue.get_queue", lambda: DummyQueue())

    run = await source_service.check_source(source.id)
    assert run.itemsQueued == 1
    item = db_session.query(MonitoredSourceItem).filter_by(monitoredSourceId=source.id).one()
    assert item.status == MonitoredSourceItemStatus.QUEUED
    assert item.downloadItemId is not None


def test_paused_source_skipped_by_scheduler_query(db_session, test_user, monkeypatch):
    _make_source(db_session, test_user, enabled=False, nextCheckAt=datetime.utcnow() - timedelta(hours=1))

    called = []
    monkeypatch.setattr(source_service, "check_source", _record_call(called))

    count = check_due_sources_once()
    assert count == 0
    assert called == []


@pytest.mark.asyncio
async def test_missing_cookies_produce_auth_required_without_deleting_source(db_session, test_user, monkeypatch):
    source = _make_source(db_session, test_user)

    async def _raise(*args, **kwargs):
        raise ytdlp_runner.YtdlpError("ERROR: Sign in to confirm you're not a bot")

    monkeypatch.setattr(ytdlp_runner, "dump_json", _raise)

    run = await source_service.check_source(source.id)
    assert run.status == "failed"

    db_session.expire_all()
    refreshed = db_session.get(MonitoredSource, source.id)
    assert refreshed is not None  # never deleted
    assert refreshed.lastError == source_service.COOKIE_AUTH_ERROR


@pytest.mark.asyncio
async def test_concurrent_check_now_and_scheduler_tick_do_not_double_process(db_session, test_user, monkeypatch):
    source = _make_source(db_session, test_user)
    monkeypatch.setattr(ytdlp_runner, "dump_json", _make_async(_playlist_payload(n=2)))

    # Simulate the scheduler already having acquired the lock.
    source.checking = True
    db_session.commit()

    run = await source_service.check_source(source.id)
    assert run is None  # compare-and-set refused a second concurrent run

    items = db_session.query(MonitoredSourceItem).filter_by(monitoredSourceId=source.id).all()
    assert len(items) == 0
