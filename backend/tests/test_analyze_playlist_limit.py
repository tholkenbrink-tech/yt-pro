from __future__ import annotations

import pytest

from app.core.config import settings
from app.services import ytdlp_runner
from app.services.analyze_service import PlaylistTooLargeError, analyze_url


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
