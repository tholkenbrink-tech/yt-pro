from __future__ import annotations

import re
import secrets
import unicodedata

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

MAX_FILENAME_LENGTH = 150

_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9._ -]")
_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def sanitize_filename(raw: str, default: str = "download", extension: str = "") -> str:
    """Strip path separators, control chars, and anything non-ASCII-safe.

    Never derived from client input beyond display purposes -- media paths are
    always built server-side from job/item UUIDs, never from this value.
    """
    if not raw:
        raw = default

    raw = raw.replace("\x00", "")
    raw = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    raw = raw.replace("/", "_").replace("\\", "_")
    raw = _CONTROL_CHARS.sub("", raw)
    raw = _UNSAFE_CHARS.sub("_", raw)
    raw = raw.strip(" ._")

    if not raw:
        raw = default

    ext = ""
    if extension:
        ext = extension if extension.startswith(".") else f".{extension}"

    max_stem = MAX_FILENAME_LENGTH - len(ext)
    if max_stem < 1:
        max_stem = 1
    raw = raw[:max_stem]

    return f"{raw}{ext}"
