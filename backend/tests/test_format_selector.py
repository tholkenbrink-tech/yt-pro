from __future__ import annotations

from app.models.download_profile import DownloadProfile
from app.services.format_selector import build_format_selector


def _profile(**overrides):
    base = dict(
        name="720p",
        maximumResolution=720,
        audioOnly=False,
        preferredContainer="mp4",
        preferredVideoCodec="h264",
        preferredAudioCodec="aac",
        enabled=True,
    )
    base.update(overrides)
    return DownloadProfile(**base)


def test_audio_only_selector():
    selector = build_format_selector(_profile(name="audio", maximumResolution=None, audioOnly=True))
    assert selector == "bestaudio[acodec^=mp4a]/bestaudio/best"


def test_capped_resolution_selector():
    selector = build_format_selector(_profile(name="480p", maximumResolution=480))
    assert "height<=480" in selector
    # Prefers an H.264 source so playback works without a re-encode pass,
    # but still falls back to codec-agnostic "best" if none is offered.
    assert "vcodec^=avc1" in selector
    assert selector.endswith(f"bestvideo[height<=480]+bestaudio/best[height<=480]")


def test_best_profile_has_no_resolution_cap():
    selector = build_format_selector(_profile(name="best", maximumResolution=None))
    assert "height<=" not in selector
    assert "vcodec^=avc1" in selector
    assert selector.endswith("bestvideo+bestaudio/best")
