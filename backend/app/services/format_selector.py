from __future__ import annotations

from app.models.download_profile import DownloadProfile


def build_format_selector(profile: DownloadProfile) -> str:
    """Builds a yt-dlp -f selector server-side from profile fields. The client
    only ever chooses a profile name -- never a raw format string."""
    if profile.audioOnly:
        codec = profile.preferredAudioCodec or "aac"
        return f"bestaudio[acodec^={codec}]/bestaudio/best"

    if profile.maximumResolution:
        height = profile.maximumResolution
        vcodec = f"[vcodec^={profile.preferredVideoCodec}]" if profile.preferredVideoCodec else ""
        return (
            f"bestvideo[height<={height}]{vcodec}+bestaudio/"
            f"best[height<={height}]/bestvideo+bestaudio/best"
        )

    # "best" profile: no resolution cap.
    vcodec = f"[vcodec^={profile.preferredVideoCodec}]" if profile.preferredVideoCodec else ""
    return f"bestvideo{vcodec}+bestaudio/best"
