from enum import Enum


class Status(str, Enum):
    """Canonical job/item status values (also the German UI labels).

    Stored as plain strings on the model columns (not a DB enum type) so new
    values can be added without a migration; this class exists so callers
    reference Status.READY instead of typo-prone literals.
    """

    ANALYZED = "analyzed"
    QUEUED = "queued"
    PREPARING = "preparing"
    DOWNLOADING_VIDEO = "downloading_video"
    DOWNLOADING_AUDIO = "downloading_audio"
    MERGING = "merging"
    OPTIMIZING_FOR_IPHONE = "optimizing_for_iphone"
    FINALIZING = "finalizing"
    READY = "ready"
    DOWNLOADED_TO_DEVICE = "downloaded_to_device"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    FAILED = "failed"


TERMINAL_STATUSES = {
    Status.READY,
    Status.DOWNLOADED_TO_DEVICE,
    Status.EXPIRED,
    Status.CANCELLED,
    Status.FAILED,
}

# Statuses a job/item can be in while the worker is actively processing it;
# used by worker-restart recovery to find work that died mid-flight.
IN_PROGRESS_STATUSES = {
    Status.PREPARING,
    Status.DOWNLOADING_VIDEO,
    Status.DOWNLOADING_AUDIO,
    Status.MERGING,
    Status.OPTIMIZING_FOR_IPHONE,
    Status.FINALIZING,
}


class SourceType(str, Enum):
    VIDEO = "video"
    SHORTS = "shorts"
    PLAYLIST = "playlist"
    MULTI = "multi"
    # inactive / reserved for future use
    CHANNEL = "channel"
    CHANNEL_VIDEOS = "channel_videos"
    CHANNEL_SHORTS = "channel_shorts"
    CHANNEL_STREAMS = "channel_streams"
    WATCHED_PLAYLIST = "watched_playlist"


ACTIVE_SOURCE_TYPES = {SourceType.VIDEO, SourceType.SHORTS, SourceType.PLAYLIST, SourceType.MULTI}


class CookieStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    VALID = "valid"
    EXPIRED = "expired"
