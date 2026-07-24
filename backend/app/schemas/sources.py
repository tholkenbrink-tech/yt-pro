from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AnalyzeSourceRequest(BaseModel):
    url: str


class AnalyzeSourceResponse(BaseModel):
    playlistTitle: Optional[str] = None
    thumbnail: Optional[str] = None
    itemCount: int
    externalPlaylistId: Optional[str] = None
    channelName: Optional[str] = None


class MonitoredSourceCreate(BaseModel):
    sourceUrl: str
    name: str
    downloadProfileId: str
    mode: str = "discover_only"
    scheduleType: str = "manual"
    cronExpression: Optional[str] = None
    maximumNewItemsPerRun: Optional[int] = None
    maximumBytesPerRun: Optional[int] = None
    maximumDurationSeconds: Optional[int] = None
    includeShorts: bool = True
    includeLivestreams: bool = False
    includePastLivestreams: bool = False
    onlyPublishedAfter: Optional[datetime] = None
    retentionPolicy: Optional[str] = None
    notificationsEnabled: bool = False
    isQuickAccess: bool = False


class MonitoredSourceUpdate(BaseModel):
    name: Optional[str] = None
    downloadProfileId: Optional[str] = None
    mode: Optional[str] = None
    scheduleType: Optional[str] = None
    cronExpression: Optional[str] = None
    maximumNewItemsPerRun: Optional[int] = None
    maximumBytesPerRun: Optional[int] = None
    maximumDurationSeconds: Optional[int] = None
    includeShorts: Optional[bool] = None
    includeLivestreams: Optional[bool] = None
    includePastLivestreams: Optional[bool] = None
    onlyPublishedAfter: Optional[datetime] = None
    retentionPolicy: Optional[str] = None
    notificationsEnabled: Optional[bool] = None
    enabled: Optional[bool] = None
    isQuickAccess: Optional[bool] = None


class MonitoredSourceOut(BaseModel):
    id: str
    name: str
    sourceUrl: str
    sourceType: str
    externalPlaylistId: Optional[str] = None
    playlistTitle: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    downloadProfileId: str
    quality: str = ""
    mode: str
    scheduleType: str
    cronExpression: Optional[str] = None
    maximumNewItemsPerRun: Optional[int] = None
    maximumBytesPerRun: Optional[int] = None
    maximumDurationSeconds: Optional[int] = None
    includeShorts: bool
    includeLivestreams: bool
    includePastLivestreams: bool
    onlyPublishedAfter: Optional[datetime] = None
    retentionPolicy: Optional[str] = None
    notificationsEnabled: bool
    enabled: bool
    isQuickAccess: bool = False
    lastCheckedAt: Optional[datetime] = None
    lastSuccessfulCheckAt: Optional[datetime] = None
    nextCheckAt: Optional[datetime] = None
    lastError: Optional[str] = None
    computedStatus: str = ""
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}


class SourceCheckRunOut(BaseModel):
    id: str
    monitoredSourceId: str
    status: str
    startedAt: datetime
    completedAt: Optional[datetime] = None
    itemsFound: int
    newItemsFound: int
    itemsQueued: int
    itemsSkippedCap: int
    estimatedBytes: Optional[int] = None
    errorMessage: Optional[str] = None

    model_config = {"from_attributes": True}


class MonitoredSourceItemOut(BaseModel):
    id: str
    monitoredSourceId: str
    youtubeId: str
    title: str
    thumbnailUrl: Optional[str] = None
    channelName: Optional[str] = None
    publishedAt: Optional[datetime] = None
    durationSeconds: Optional[int] = None
    estimatedFileSize: Optional[int] = None
    discoveredAt: datetime
    status: str
    downloadItemId: Optional[str] = None
    ignoredAt: Optional[datetime] = None

    model_config = {"from_attributes": True}
