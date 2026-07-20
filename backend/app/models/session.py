from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import new_uuid, utcnow


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_uuid)
    userId: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime(), default=utcnow, nullable=False)
    expiresAt: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
