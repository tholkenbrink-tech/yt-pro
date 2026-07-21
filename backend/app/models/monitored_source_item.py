from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid, utcnow


class MonitoredSourceItemStatus:
    DISCOVERED = "discovered"
    AWAITING_CONFIRMATION = "awaitingConfirmation"
    QUEUED = "queued"
    PREPARING = "preparing"
    READY = "ready"
    IGNORED = "ignored"
    FAILED = "failed"
    UNAVAILABLE = "unavailable"


class MonitoredSourceItem(Base, TimestampMixin):
    __tablename__ = "monitored_source_items"
    __table_args__ = (
        Index("ix_monitored_source_items_source_yt", "monitoredSourceId", "youtubeId", unique=True),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    monitoredSourceId: Mapped[str] = mapped_column(
        String(36), ForeignKey("monitored_sources.id"), nullable=False
    )
    youtubeId: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    thumbnailUrl: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    channelName: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    publishedAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    durationSeconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    estimatedFileSize: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    discoveredAt: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default=MonitoredSourceItemStatus.DISCOVERED, nullable=False
    )
    downloadItemId: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("download_items.id"), nullable=True
    )
    ignoredAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    source: Mapped["MonitoredSource"] = relationship(back_populates="items")
