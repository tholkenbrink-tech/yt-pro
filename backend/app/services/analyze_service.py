from __future__ import annotations

import asyncio
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.download_item import DownloadItem
from app.models.download_profile import DownloadProfile
from app.models.status import Status
from app.schemas.analyze import AnalyzedItem, AnalyzeResponse, QualityOption
from app.services import ytdlp_runner
from app.services.url_validation import validate_media_url


class PlaylistTooLargeError(ValueError):
    pass


# Statuses that don't count as "already downloaded" - a failed/cancelled/
# expired item never produced a usable file (or no longer has one), so the
# same video should still be offered normally rather than greyed out.
_NOT_ALREADY_DOWNLOADED_STATUSES = {Status.FAILED, Status.CANCELLED, Status.EXPIRED}


def _normalize_youtube_id(value: str) -> str:
    """DownloadItem.youtubeId is overloaded: playlist/source items store the
    real short id, but a plain single-video job (no items/itemIds submitted)
    stores the user-submitted URL as-is (see jobs.py's create() fallback and
    download_job.py's matching comment). Normalize both shapes to the short
    id so dedup matching works regardless of which flow downloaded a video."""
    if not value.startswith(("http://", "https://")):
        return value
    parsed = urlparse(value)
    if parsed.hostname and "youtu.be" in parsed.hostname:
        return parsed.path.strip("/").split("/")[0]
    query_id = parse_qs(parsed.query).get("v", [None])[0]
    if query_id:
        return query_id
    return parsed.path.rstrip("/").rsplit("/", 1)[-1]


def _find_already_downloaded(db: DBSession, youtube_ids: list[str]) -> set[str]:
    """youtubeIds that already exist anywhere in the shared household library
    (any status but failed/cancelled/expired) - checked household-wide, not
    per-user, matching the library/history endpoints' shared-NAS model."""
    if not youtube_ids:
        return set()
    wanted = set(youtube_ids)
    rows = db.execute(
        select(DownloadItem.youtubeId).where(
            DownloadItem.status.notin_([s.value for s in _NOT_ALREADY_DOWNLOADED_STATUSES])
        )
    ).scalars().all()
    existing = {_normalize_youtube_id(r) for r in rows}
    return wanted & existing


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
    validated = validate_media_url(url)
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
        already_downloaded = _find_already_downloaded(db, [i.youtubeId for i in items])
        for item in items:
            item.alreadyDownloaded = item.youtubeId in already_downloaded
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
    item.alreadyDownloaded = bool(_find_already_downloaded(db, [item.youtubeId]))
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
    validated_urls = [validate_media_url(u) for u in urls]
    results = await asyncio.gather(*(ytdlp_runner.dump_json(u) for u in validated_urls))
    items = [_to_analyzed_item(d) for d in results]
    already_downloaded = _find_already_downloaded(db, [i.youtubeId for i in items])
    for item in items:
        item.alreadyDownloaded = item.youtubeId in already_downloaded

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
