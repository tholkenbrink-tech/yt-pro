from __future__ import annotations

from urllib.parse import urlparse

ALLOWED_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
}


class InvalidUrlError(ValueError):
    pass


def validate_youtube_url(url: str) -> str:
    """Validates via urlparse's hostname, never regex on the raw string
    (regex-on-string is spoofable by e.g. 'evil.com/youtube.com')."""
    try:
        parsed = urlparse(url.strip())
    except ValueError as exc:
        raise InvalidUrlError("Invalid URL") from exc

    if parsed.scheme not in ("http", "https"):
        raise InvalidUrlError("Only http/https URLs are allowed")

    hostname = parsed.hostname
    if not hostname or hostname.lower() not in ALLOWED_HOSTS:
        raise InvalidUrlError(f"Host not allowed: {hostname}")

    return url.strip()
