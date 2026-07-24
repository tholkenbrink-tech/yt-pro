from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid


class MonitoredSourceMode:
    DISCOVER_ONLY = "discover_only"
    CONFIRM_FIRST = "confirm_first"
    AUTO_PREPARE = "auto_prepare"


class MonitoredSourceScheduleType:
    MANUAL = "manual"
    EVERY_6H = "every_6h"
    EVERY_12H = "every_12h"
    DAILY = "daily"
    WEEKLY = "weekly"
    CRON = "cron"


class MonitoredSource(Base, TimestampMixin):
    __tablename__ = "monitored_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sourceUrl: Mapped[str] = mapped_column(String(2048), nullable=False)
    sourceType: Mapped[str] = mapped_column(String(32), nullable=False)
    externalPlaylistId: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    playlistTitle: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    thumbnailUrl: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    downloadProfileId: Mapped[str] = mapped_column(String(36), ForeignKey("download_profiles.id"), nullable=False)
    mode: Mapped[str] = mapped_column(String(32), default=MonitoredSourceMode.DISCOVER_ONLY, nullable=False)
    scheduleType: Mapped[str] = mapped_column(
        String(32), default=MonitoredSourceScheduleType.MANUAL, nullable=False
    )
    cronExpression: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    maximumNewItemsPerRun: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    maximumBytesPerRun: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    maximumDurationSeconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    includeShorts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    includeLivestreams: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    includePastLivestreams: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    onlyPublishedAfter: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    retentionPolicy: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    notificationsEnabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # A manually-triggered playlist bookmark shown on the download page,
    # rather than a scheduled automation source shown under Settings >
    # Sources. Always paired with mode=discover_only, scheduleType=manual.
    isQuickAccess: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Atomic compare-and-set lock flag so a manual check-now and the scheduler
    # tick can never process the same source concurrently (SQLite has no row locks).
    checking: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    lastCheckedAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    lastSuccessfulCheckAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    nextCheckAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    lastError: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    items: Mapped[list["MonitoredSourceItem"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    runs: Mapped[list["SourceCheckRun"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
