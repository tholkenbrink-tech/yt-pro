from __future__ import annotations

import pytest

from app.services.url_validation import InvalidUrlError, validate_media_url

VALID_URLS = [
    "https://youtube.com/watch?v=abc123",
    "https://www.youtube.com/watch?v=abc123",
    "https://m.youtube.com/watch?v=abc123",
    "https://music.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://www.ardmediathek.de/video/phoenix-vor-ort/juergen-klopp-neuer-bundestrainer/phoenix/Y3JpZDovL3Bob2VuaXguZGUvNTIyMDU2NA",
    "https://www.zdf.de/play/talk/markus-lanz-114/markus-lanz-vom-16-juli-2026-100",
]

INVALID_URLS = [
    "https://evil.com/youtube.com",
    "https://youtube.com.evil.com/watch?v=abc123",
    "https://192.168.0.1/watch?v=abc123",
    "javascript:alert(1)",
    "https://notyoutube.com",
    "ftp://youtube.com/watch?v=abc",
    "https://evil.com/ardmediathek.de",
    "https://zdf.de.evil.com/play/x",
]


@pytest.mark.parametrize("url", VALID_URLS)
def test_accepts_allowlisted_hosts(url):
    assert validate_media_url(url) == url


@pytest.mark.parametrize("url", INVALID_URLS)
def test_rejects_non_allowlisted_hosts(url):
    with pytest.raises(InvalidUrlError):
        validate_media_url(url)
