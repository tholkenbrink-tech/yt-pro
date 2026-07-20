from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import new_uuid
from app.models.status import CookieStatus


class CookieConfig(Base):
    __tablename__ = "cookie_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    status: Mapped[str] = mapped_column(String(32), default=CookieStatus.NOT_CONFIGURED.value, nullable=False)
    uploadedAt: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    filePathHint: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
