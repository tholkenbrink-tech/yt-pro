from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProgressOut(BaseModel):
    positionSeconds: float = 0.0
    durationSeconds: Optional[float] = None
    percentage: float = 0.0
    completed: bool = False
    playbackRate: float = 1.0
    lastPlayedAt: Optional[datetime] = None


class ProgressUpdateRequest(BaseModel):
    positionSeconds: float
    durationSeconds: Optional[float] = None
    playbackRate: float = 1.0


class KeepUpdateRequest(BaseModel):
    keep: bool


class LibraryProgressOut(BaseModel):
    positionSeconds: float
    percentage: float
    completed: bool


class LibraryItemOut(BaseModel):
    id: str
    title: str
    channelName: Optional[str] = None
    thumbnailPath: Optional[str] = None
    duration: Optional[int] = None
    selectedQuality: str
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    status: str
    isAutomaticallyPrepared: bool
    sourceName: Optional[str] = None
    sourceId: Optional[str] = None
    jobId: Optional[str] = None
    playlistTitle: Optional[str] = None
    ownerName: Optional[str] = None
    publishedAt: Optional[datetime] = None
    createdAt: datetime
    expiresAt: Optional[datetime] = None
    keepOnServer: bool
    progress: Optional[LibraryProgressOut] = None

    model_config = {"from_attributes": True}
