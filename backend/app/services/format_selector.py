from __future__ import annotations

from app.models.download_profile import DownloadProfile


def build_format_selector(profile: DownloadProfile) -> str:
    """Builds a yt-dlp -f selector server-side from profile fields. The client
    only ever chooses a profile name -- never a raw format string.

    No vcodec filter on the source selection: `preferredVideoCodec` is a
    target ENCODE codec (applied by the ffmpeg pass in download_job.py when
    `videoBitrateKbps` is set), not a source-format preference - filtering
    source formats by codec (e.g. hevc) would frequently match nothing,
    since YouTube rarely serves HEVC streams directly."""
    if profile.audioOnly:
        return "bestaudio/best"

    if profile.maximumResolution:
        height = profile.maximumResolution
        return f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/bestvideo+bestaudio/best"

    return "bestvideo+bestaudio/best"
