from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class StorageOut(BaseModel):
    usedBytes: int
    freeBytes: int
    lowSpaceWarning: bool
    retentionHours: Optional[int] = None


class RetentionUpdateRequest(BaseModel):
    hours: Optional[int] = None
