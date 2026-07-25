from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin, new_uuid


class Folder(Base, TimestampMixin):
    __tablename__ = "folders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    # Display name (e.g. the playlist/source title).
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Canonical on-disk directory name under TEMP_DIR - the sanitized form of
    # `name`, unique so folder identity is keyed on it. Reusing the same
    # playlist link (same title each time) or the same monitored source
    # always resolves to the same row via folder_service.get_or_create_folder,
    # so items land in one folder in the Mediathek and one NAS directory no
    # matter which job/run downloaded them.
    dirName: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)

    items: Mapped[list["DownloadItem"]] = relationship(back_populates="folder")
