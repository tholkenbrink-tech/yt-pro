from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid
from app.models.status import Status


class DownloadItem(Base, TimestampMixin):
    __tablename__ = "download_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    jobId: Mapped[str] = mapped_column(String(36), ForeignKey("download_jobs.id"), nullable=False)
    youtubeId: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    channelName: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    thumbnailPath: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    duration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    selectedQuality: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=Status.QUEUED.value, nullable=False)
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    mediaPath: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    fileName: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    fileSize: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mimeType: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    conversionNote: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    activeStreams: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    downloadedToDeviceAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    deletedFromServerAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    expiresAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    errorMessage: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    job: Mapped["DownloadJob"] = relationship(back_populates="items")
