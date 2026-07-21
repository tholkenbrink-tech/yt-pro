from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import new_uuid, utcnow


class SourceCheckRunStatus:
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SourceCheckRun(Base):
    __tablename__ = "source_check_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    monitoredSourceId: Mapped[str] = mapped_column(
        String(36), ForeignKey("monitored_sources.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), default=SourceCheckRunStatus.RUNNING, nullable=False)
    startedAt: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)
    completedAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    itemsFound: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    newItemsFound: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    itemsQueued: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Not part of the original field list -- documented deviation: tracks items
    # skipped once maximumNewItemsPerRun/maximumBytesPerRun caps were hit, per
    # the spec's "don't silently drop" requirement.
    itemsSkippedCap: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimatedBytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    errorMessage: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(default=utcnow, nullable=False)

    source: Mapped["MonitoredSource"] = relationship(back_populates="runs")
