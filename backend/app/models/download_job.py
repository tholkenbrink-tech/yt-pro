from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid
from app.models.status import Status


class DownloadJob(Base, TimestampMixin):
    __tablename__ = "download_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    sourceUrl: Mapped[str] = mapped_column(String(2048), nullable=False)
    sourceType: Mapped[str] = mapped_column(String(32), nullable=False)
    selectedQuality: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default=Status.QUEUED.value, nullable=False)
    progress: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    currentStep: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    downloadedBytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimatedTotalBytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    estimatedRemainingSeconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    errorMessage: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    startedAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    completedAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    expiresAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    items: Mapped[list["DownloadItem"]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="DownloadItem.createdAt"
    )
