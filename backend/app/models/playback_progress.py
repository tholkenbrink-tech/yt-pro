from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid


class PlaybackProgress(Base, TimestampMixin):
    __tablename__ = "playback_progress"
    __table_args__ = (
        Index("ix_playback_progress_user_item", "userId", "downloadItemId", unique=True),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    downloadItemId: Mapped[str] = mapped_column(String(36), ForeignKey("download_items.id"), nullable=False)
    positionSeconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    durationSeconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    percentage: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    playbackRate: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    lastPlayedAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
