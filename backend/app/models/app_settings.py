from __future__ import annotations

from typing import Optional

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid

SINGLETON_ID = "singleton"


class AppSettings(Base, TimestampMixin):
    """Single-row runtime-configurable settings (retention etc.). Not env-only
    because the storage endpoint must let the user change retention at runtime."""

    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: SINGLETON_ID)
    retentionHours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
