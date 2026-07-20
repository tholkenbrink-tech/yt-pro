from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.utcnow()


def new_uuid() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    createdAt: Mapped[datetime] = mapped_column(DateTime(), default=utcnow, nullable=False)
    updatedAt: Mapped[datetime] = mapped_column(
        DateTime(), default=utcnow, onupdate=utcnow, nullable=False
    )
