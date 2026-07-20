from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, model_validator


class AnalyzeRequest(BaseModel):
    url: Optional[str] = None
    urls: Optional[list[str]] = None

    @model_validator(mode="after")
    def _require_one(self):
        if not self.url and not self.urls:
            raise ValueError("Either 'url' or 'urls' must be provided")
        return self


class QualityOption(BaseModel):
    name: str
    audioOnly: bool
    maximumResolution: Optional[int] = None


class AnalyzedItem(BaseModel):
    youtubeId: str
    title: str
    channelName: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[int] = None
    uploadDate: Optional[str] = None


class AnalyzeResponse(BaseModel):
    sourceType: str
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    channelName: Optional[str] = None
    duration: Optional[int] = None
    uploadDate: Optional[str] = None
    availableQualities: list[QualityOption]
    items: list[AnalyzedItem]
    itemCount: int
