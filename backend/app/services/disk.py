from __future__ import annotations

import shutil

from app.core.config import settings


def has_enough_free_disk(path: str = "/") -> bool:
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return True  # fail-open on unreadable path; not the concern being guarded
    return usage.free >= settings.MIN_FREE_DISK_BYTES


def disk_usage_bytes(path: str = "/") -> tuple[int, int]:
    usage = shutil.disk_usage(path)
    return usage.free, usage.total
