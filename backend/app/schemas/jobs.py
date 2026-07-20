from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CreateJobRequest(BaseModel):
    url: str
    selectedQuality: str
    itemIds: Optional[list[str]] = None
    sourceType: Optional[str] = None


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

    model_config = {"from_attributes": True}


class DownloadJobOut(BaseModel):
    id: str
    userId: str
    sourceUrl: str
    sourceType: str
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

    model_config = {"from_attributes": True}


class DuplicateJobError(BaseModel):
    detail: str
    existingJobId: str
