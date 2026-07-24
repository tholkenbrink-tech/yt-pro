from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid


class DownloadProfile(Base, TimestampMixin):
    __tablename__ = "download_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    maximumResolution: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    audioOnly: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preferredContainer: Mapped[str] = mapped_column(String(16), nullable=False)
    # Unused by download_job.py (no re-encode pass runs), kept for the
    # profile records' own history/display - not acted on for transcoding.
    preferredVideoCodec: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    preferredAudioCodec: Mapped[str] = mapped_column(String(16), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    videoBitrateKbps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    audioBitrateKbps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    maxFps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pixelFormat: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
