from __future__ import annotations

import re
from typing import Iterable, Optional

# yt-dlp folds its warnings and errors into the same stream as progress lines
# (see ytdlp_runner.run_download), so the worker sees them - it just used to
# throw them away and store "See server logs for details" instead. The NAS
# logs aren't reachable from a phone, which is the only place this app is
# ever used from, so that message left no way to tell a rate-limited download
# apart from a full disk. Keep the tail of what yt-dlp said and turn the
# handful of failures that actually recur into an answer the user can act on.
LOG_TAIL_LINES = 60

# DownloadItem.errorMessage is String(1024); anything past a sentence or two
# is unreadable on a phone anyway.
_MAX_MESSAGE_LENGTH = 400

GENERIC_FAILURE_MESSAGE = "Download fehlgeschlagen. Details stehen im Worker-Log."

# Ordered most-specific first - the first pattern found anywhere in the
# captured output wins.
_RULES: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"No space left on device|Disk quota exceeded|Errno 28", re.I),
        "Kein freier Speicherplatz mehr auf der NAS. Alte Downloads löschen und erneut versuchen.",
    ),
    (
        re.compile(
            r"HTTP Error 429|Too Many Requests|Sign in to confirm you.?re not a bot"
            r"|confirm you.?re not a bot|blocked it on suspicion of bot",
            re.I,
        ),
        "YouTube hat die Anfrage gedrosselt (Rate-Limit bzw. Bot-Prüfung). Etwas warten und "
        "erneut versuchen, oder unter Einstellungen frische YouTube-Cookies hinterlegen.",
    ),
    (
        re.compile(r"cookies are no longer valid|The provided YouTube account cookies|Fresh cookies", re.I),
        "Die hinterlegten YouTube-Cookies sind abgelaufen. Unter Einstellungen neue Cookies "
        "hochladen und erneut versuchen.",
    ),
    (
        re.compile(r"Private video|Sign in if you.?ve been granted access", re.I),
        "Das Video ist privat. Ohne passende YouTube-Cookies ist kein Zugriff möglich.",
    ),
    (
        re.compile(r"members-only|Join this channel|only available to Music Premium", re.I),
        "Das Video ist nur für Kanal-Mitglieder bzw. Premium-Abos verfügbar.",
    ),
    (
        re.compile(r"age-restricted|Sign in to confirm your age|inappropriate for some users", re.I),
        "Altersbeschränktes Video. Dafür werden YouTube-Cookies eines angemeldeten Kontos benötigt.",
    ),
    (
        re.compile(r"not available in your country|blocked it in your country|geo.?restrict", re.I),
        "Das Video ist in diesem Land gesperrt.",
    ),
    (
        re.compile(
            r"Video unavailable|has been removed|account associated with this video has been terminated"
            r"|This video is (?:no longer|not) available",
            re.I,
        ),
        "Das Video ist bei YouTube nicht mehr verfügbar.",
    ),
    (
        re.compile(r"live event will begin|is not currently live|Premieres in", re.I),
        "Das Video ist ein Livestream bzw. eine Premiere, die noch nicht gestartet ist.",
    ),
    (
        re.compile(r"Requested format is not available|No video formats found", re.I),
        "Kein passendes Format gefunden. Eventuell bietet YouTube dieses Video nur in einem "
        "nicht unterstützten Codec an - andere Qualität versuchen.",
    ),
    (
        re.compile(r"ffmpeg|Postprocessing:|Merging formats", re.I),
        "Video und Ton konnten nach dem Download nicht zusammengeführt werden (ffmpeg).",
    ),
    (
        re.compile(r"HTTP Error 40[38]|Unable to download video data|fragment .* not found", re.I),
        "YouTube hat den Download abgelehnt. Meist hilft ein erneuter Versuch oder frische Cookies.",
    ),
    (
        re.compile(
            r"Unable to download webpage|Connection reset|timed out|Temporary failure in name resolution"
            r"|Network is unreachable|HTTP Error 5\d\d",
            re.I,
        ),
        "Netzwerkfehler beim Zugriff auf YouTube. Internet-Verbindung der NAS prüfen und erneut versuchen.",
    ),
]

# "ERROR: [youtube] dQw4w9WgXcQ: <what actually went wrong>" - the prefix is
# noise for a phone-sized error line.
_ERROR_PREFIX_RE = re.compile(r"^ERROR:\s*(?:\[[^\]]+\]\s*)?(?:[\w-]{6,15}:\s*)?")

# A rejected option prints "yt-dlp: error: ..." and exits before downloading
# anything - no "ERROR:" line at all. That is always our own bug rather than
# anything the user did, but it still beats sending them to a log they cannot
# reach from a phone (an invalid --merge-output-format broke every audio
# download exactly this way).
_USAGE_ERROR_RE = re.compile(r"^yt-dlp:\s*error:\s*", re.I)


def _truncate(message: str) -> str:
    if len(message) <= _MAX_MESSAGE_LENGTH:
        return message
    return message[: _MAX_MESSAGE_LENGTH - 1].rstrip() + "…"


def _last_error_line(lines: list[str]) -> Optional[str]:
    for line in reversed(lines):
        stripped = line.strip()
        if stripped.startswith("ERROR:"):
            detail = _ERROR_PREFIX_RE.sub("", stripped).strip()
            if detail:
                return detail
        if _USAGE_ERROR_RE.match(stripped):
            detail = _USAGE_ERROR_RE.sub("", stripped).strip()
            if detail:
                return detail
    return None


def classify_download_failure(output_lines: Iterable[str], returncode: Optional[int] = None) -> str:
    """Turns the tail of yt-dlp's output into a message worth showing in the
    app. Falls back to yt-dlp's own last ERROR line (prefix stripped) when
    nothing matches, so an unrecognized failure still says something more
    useful than "it failed"."""
    lines = [line for line in output_lines if line and line.strip()]
    haystack = "\n".join(lines)

    for pattern, message in _RULES:
        if pattern.search(haystack):
            return message

    detail = _last_error_line(lines)
    if detail:
        return _truncate(f"Download fehlgeschlagen: {detail}")
    if returncode is not None:
        return f"Download fehlgeschlagen (yt-dlp Code {returncode}). Details stehen im Worker-Log."
    return GENERIC_FAILURE_MESSAGE
