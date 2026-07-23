from __future__ import annotations

import asyncio
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.download_profile import DownloadProfile
from app.schemas.analyze import AnalyzedItem, AnalyzeResponse, QualityOption
from app.services import ytdlp_runner
from app.services.url_validation import validate_youtube_url


class PlaylistTooLargeError(ValueError):
    pass


def get_available_qualities(db: DBSession) -> list[QualityOption]:
    profiles = db.execute(
        select(DownloadProfile).where(DownloadProfile.enabled.is_(True))
    ).scalars().all()
    return [
        QualityOption(name=p.name, audioOnly=p.audioOnly, maximumResolution=p.maximumResolution)
        for p in profiles
    ]


def _to_analyzed_item(entry: dict[str, Any]) -> AnalyzedItem:
    youtube_id = entry.get("id") or ""
    thumbnail = entry.get("thumbnail")
    if not thumbnail and entry.get("thumbnails"):
        thumbnail = entry["thumbnails"][-1].get("url")
    if not thumbnail and youtube_id:
        # --flat-playlist entries usually don't carry a thumbnail URL, but
        # YouTube's thumbnail URL is deterministic from the video ID, so this
        # avoids an extra per-item yt-dlp call just to fill it in.
        thumbnail = f"https://i.ytimg.com/vi/{youtube_id}/hqdefault.jpg"
    return AnalyzedItem(
        youtubeId=youtube_id,
        title=entry.get("title") or "Untitled",
        channelName=entry.get("channel") or entry.get("uploader"),
        thumbnail=thumbnail,
        duration=entry.get("duration"),
        uploadDate=entry.get("upload_date"),
    )


async def analyze_url(url: str, db: DBSession) -> AnalyzeResponse:
    validated = validate_youtube_url(url)
    qualities = get_available_qualities(db)

    # --flat-playlist keeps a playlist's enumeration fast (no per-video full
    # metadata extraction, which previously made playlists blow past
    # ANALYZE_TIMEOUT_SECONDS and surface as a client-side network error) -
    # for a plain single-video URL this has no effect, yt-dlp still returns
    # its full metadata directly.
    data = await ytdlp_runner.dump_json(validated, flat_playlist=True)

    if data.get("_type") == "playlist" or "entries" in data:
        entries = list(data.get("entries") or [])
        if len(entries) > settings.MAX_PLAYLIST_ITEMS:
            raise PlaylistTooLargeError(
                f"Playlist has {len(entries)} items, exceeding the limit of {settings.MAX_PLAYLIST_ITEMS}"
            )
        items = [_to_analyzed_item(e) for e in entries]
        return AnalyzeResponse(
            sourceType="playlist",
            playlistTitle=data.get("title"),
            thumbnail=data.get("thumbnails", [{}])[-1].get("url") if data.get("thumbnails") else None,
            channelName=data.get("channel") or data.get("uploader"),
            duration=None,
            uploadDate=None,
            availableQualities=qualities,
            items=items,
            itemCount=len(items),
        )

    item = _to_analyzed_item(data)
    source_type = "shorts" if "/shorts/" in validated else "video"
    return AnalyzeResponse(
        sourceType=source_type,
        title=item.title,
        thumbnail=item.thumbnail,
        channelName=item.channelName,
        duration=item.duration,
        uploadDate=item.uploadDate,
        availableQualities=qualities,
        items=[item],
        itemCount=1,
    )


async def analyze_multi(urls: list[str], db: DBSession) -> AnalyzeResponse:
    qualities = get_available_qualities(db)
    if len(urls) > settings.MAX_PLAYLIST_ITEMS:
        raise PlaylistTooLargeError(
            f"{len(urls)} URLs exceed the limit of {settings.MAX_PLAYLIST_ITEMS}"
        )

    # Run all lookups concurrently instead of sequentially - previously N
    # pasted links took up to N * ANALYZE_TIMEOUT_SECONDS in the worst case,
    # which regularly exceeded the frontend/tunnel's patience and surfaced
    # as a generic network error rather than a clean timeout response.
    validated_urls = [validate_youtube_url(u) for u in urls]
    results = await asyncio.gather(*(ytdlp_runner.dump_json(u) for u in validated_urls))
    items = [_to_analyzed_item(d) for d in results]

    return AnalyzeResponse(
        sourceType="multi",
        playlistTitle=f"{len(items)} eingefügte Videos",
        thumbnail=None,
        channelName=None,
        duration=None,
        uploadDate=None,
        availableQualities=qualities,
        items=items,
        itemCount=len(items),
    )
