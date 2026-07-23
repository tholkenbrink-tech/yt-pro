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
    assert selector == "bestaudio/best"


def test_capped_resolution_selector():
    selector = build_format_selector(_profile(name="480p", maximumResolution=480))
    assert "height<=480" in selector
    # No vcodec filter on the source selection - preferredVideoCodec is a
    # target encode codec, applied later by ffmpeg, not a source filter.
    assert "vcodec" not in selector


def test_best_profile_has_no_resolution_cap():
    selector = build_format_selector(_profile(name="best", maximumResolution=None))
    assert "height<=" not in selector
    assert "vcodec" not in selector
