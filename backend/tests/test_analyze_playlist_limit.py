from __future__ import annotations

import pytest

from app.core.config import settings
from app.models.download_item import DownloadItem
from app.models.download_job import DownloadJob
from app.models.status import Status
from app.services import ytdlp_runner
from app.services.analyze_service import PlaylistTooLargeError, analyze_url


def _add_download_item(db_session, test_user, youtube_id: str, status: str = Status.READY.value):
    job = DownloadJob(
        userId=test_user.id,
        sourceUrl=f"https://youtube.com/watch?v={youtube_id}",
        sourceType="video",
        selectedQuality="720p",
        status=status,
    )
    db_session.add(job)
    db_session.flush()
    item = DownloadItem(
        jobId=job.id,
        youtubeId=youtube_id,
        title="Existing video",
        selectedQuality="720p",
        status=status,
    )
    db_session.add(item)
    db_session.commit()


async def _fake_dump_json_too_many(url, flat_playlist=False):
    entries = [{"id": f"vid{i}", "title": f"Video {i}"} for i in range(settings.MAX_PLAYLIST_ITEMS + 1)]
    return {"_type": "playlist", "title": "Huge Playlist", "entries": entries}


async def _fake_dump_json_ok(url, flat_playlist=False):
    entries = [{"id": f"vid{i}", "title": f"Video {i}"} for i in range(5)]
    return {"_type": "playlist", "title": "Small Playlist", "entries": entries}


@pytest.mark.asyncio
async def test_playlist_over_limit_rejected(db_session, monkeypatch):
    monkeypatch.setattr(ytdlp_runner, "dump_json", _fake_dump_json_too_many)
    with pytest.raises(PlaylistTooLargeError):
        await analyze_url("https://youtube.com/playlist?list=abc", db_session)


@pytest.mark.asyncio
async def test_playlist_under_limit_accepted(db_session, monkeypatch):
    monkeypatch.setattr(ytdlp_runner, "dump_json", _fake_dump_json_ok)
    result = await analyze_url("https://youtube.com/playlist?list=abc", db_session)
    assert result.itemCount == 5
    assert result.sourceType == "playlist"


@pytest.mark.asyncio
async def test_playlist_items_flag_already_downloaded(db_session, test_user, monkeypatch):
    monkeypatch.setattr(ytdlp_runner, "dump_json", _fake_dump_json_ok)
    _add_download_item(db_session, test_user, "vid2")

    result = await analyze_url("https://youtube.com/playlist?list=abc", db_session)

    by_id = {item.youtubeId: item for item in result.items}
    assert by_id["vid2"].alreadyDownloaded is True
    assert by_id["vid0"].alreadyDownloaded is False


@pytest.mark.asyncio
async def test_failed_download_does_not_count_as_already_downloaded(db_session, test_user, monkeypatch):
    monkeypatch.setattr(ytdlp_runner, "dump_json", _fake_dump_json_ok)
    _add_download_item(db_session, test_user, "vid1", status=Status.FAILED.value)

    result = await analyze_url("https://youtube.com/playlist?list=abc", db_session)

    by_id = {item.youtubeId: item for item in result.items}
    assert by_id["vid1"].alreadyDownloaded is False


@pytest.mark.asyncio
async def test_single_video_job_url_form_is_matched_by_short_id(db_session, test_user, monkeypatch):
    # A plain single-video job (no items/itemIds submitted) stores the
    # user-submitted URL as-is in youtubeId (see jobs.py's create()
    # fallback) - dedup must still recognize it against a playlist entry's
    # bare short id for the same video.
    monkeypatch.setattr(ytdlp_runner, "dump_json", _fake_dump_json_ok)
    _add_download_item(db_session, test_user, "https://www.youtube.com/watch?v=vid3")

    result = await analyze_url("https://youtube.com/playlist?list=abc", db_session)

    by_id = {item.youtubeId: item for item in result.items}
    assert by_id["vid3"].alreadyDownloaded is True
