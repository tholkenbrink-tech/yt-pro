from __future__ import annotations

from app.models.download_profile import DownloadProfile


def build_format_selector(profile: DownloadProfile) -> str:
    """Builds a yt-dlp -f selector server-side from profile fields. The client
    only ever chooses a profile name -- never a raw format string.

    There is no re-encode pass (see download_job.py), so whatever codec the
    selected source format carries is exactly what ships to playback. YouTube
    usually offers an avc1 (H.264) + mp4a (AAC) pair alongside the VP9/AV1 +
    Opus ones, so prefer that pair explicitly - it's universally decodable
    (iPadOS/Safari/AVFoundation included), unlike VP9/AV1-in-mp4. Only fall
    back to the codec-agnostic "best" selection when no H.264 source format
    exists at all, so a download still succeeds rather than failing outright."""
    if profile.audioOnly:
        return "bestaudio[acodec^=mp4a]/bestaudio/best"

    height_filter = f"[height<={profile.maximumResolution}]" if profile.maximumResolution else ""

    return "/".join(
        [
            f"bestvideo[vcodec^=avc1]{height_filter}+bestaudio[acodec^=mp4a]",
            f"bestvideo[vcodec^=avc1]{height_filter}+bestaudio",
            f"best[vcodec^=avc1]{height_filter}",
            f"bestvideo{height_filter}+bestaudio",
            f"best{height_filter}",
        ]
    )
