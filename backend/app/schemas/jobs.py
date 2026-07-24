from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, computed_field


class JobItemMeta(BaseModel):
    youtubeId: str
    title: Optional[str] = None
    channelName: Optional[str] = None
    thumbnailPath: Optional[str] = None
    duration: Optional[int] = None


class CreateJobRequest(BaseModel):
    url: str
    selectedQuality: str
    itemIds: Optional[list[str]] = None
    sourceType: Optional[str] = None
    title: Optional[str] = None
    channelName: Optional[str] = None
    thumbnailPath: Optional[str] = None
    items: Optional[list[JobItemMeta]] = None
    # Playlist's own display name (distinct from `title`, which is a single
    # video's title) - used for Mediathek folder grouping and NAS folder naming.
    playlistTitle: Optional[str] = None


class DownloadItemOut(BaseModel):
    id: str
    jobId: str
    youtubeId: str
    title: str
    channelName: Optional[str] = None
    thumbnailPath: Optional[str] = None
    duration: Optional[int] = None
    selectedQuality: str
    status: str
    progress: float
    fileName: Optional[str] = None
    fileSize: Optional[int] = None
    mimeType: Optional[str] = None
    conversionNote: Optional[str] = None
    downloadedToDeviceAt: Optional[datetime] = None
    deletedFromServerAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None
    errorMessage: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    ownerName: Optional[str] = None

    model_config = {"from_attributes": True}


class DownloadJobOut(BaseModel):
    id: str
    userId: str
    sourceUrl: str
    sourceType: str
    title: Optional[str] = None
    selectedQuality: str
    status: str
    progress: float
    currentStep: Optional[str] = None
    downloadedBytes: int
    estimatedTotalBytes: Optional[int] = None
    speed: Optional[float] = None
    estimatedRemainingSeconds: Optional[float] = None
    errorMessage: Optional[str] = None
    createdAt: datetime
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None
    expiresAt: Optional[datetime] = None
    items: list[DownloadItemOut] = []

    @computed_field
    @property
    def jobId(self) -> str:
        return self.id

    model_config = {"from_attributes": True}


class DuplicateJobError(BaseModel):
    detail: str
    existingJobId: str
