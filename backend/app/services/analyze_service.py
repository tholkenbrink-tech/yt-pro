from __future__ import annotations

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
    return AnalyzedItem(
        youtubeId=entry.get("id") or "",
        title=entry.get("title") or "Untitled",
        channelName=entry.get("channel") or entry.get("uploader"),
        thumbnail=entry.get("thumbnail"),
        duration=entry.get("duration"),
        uploadDate=entry.get("upload_date"),
    )


async def analyze_url(url: str, db: DBSession) -> AnalyzeResponse:
    validated = validate_youtube_url(url)
    qualities = get_available_qualities(db)

    data = await ytdlp_runner.dump_json(validated)

    if data.get("_type") == "playlist" or "entries" in data:
        entries = list(data.get("entries") or [])
        if len(entries) > settings.MAX_PLAYLIST_ITEMS:
            raise PlaylistTooLargeError(
                f"Playlist has {len(entries)} items, exceeding the limit of {settings.MAX_PLAYLIST_ITEMS}"
            )
        items = [_to_analyzed_item(e) for e in entries]
        return AnalyzeResponse(
            sourceType="playlist",
            title=data.get("title"),
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

    items: list[AnalyzedItem] = []
    for u in urls:
        validated = validate_youtube_url(u)
        data = await ytdlp_runner.dump_json(validated)
        items.append(_to_analyzed_item(data))

    return AnalyzeResponse(
        sourceType="multi",
        title=None,
        thumbnail=None,
        channelName=None,
        duration=None,
        uploadDate=None,
        availableQualities=qualities,
        items=items,
        itemCount=len(items),
    )
