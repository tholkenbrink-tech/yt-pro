from __future__ import annotations

import logging
import os
import time
from datetime import datetime

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.download_item import DownloadItem

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("yt_pro.scheduler")

POLL_INTERVAL_SECONDS = 60


def expire_once() -> int:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        expired = db.execute(
            select(DownloadItem)
            .where(DownloadItem.expiresAt.is_not(None))
            .where(DownloadItem.expiresAt < now)
            .where(DownloadItem.deletedFromServerAt.is_(None))
            .where(DownloadItem.activeStreams == 0)
        ).scalars().all()

        for item in expired:
            if item.mediaPath and os.path.exists(item.mediaPath):
                try:
                    os.remove(item.mediaPath)
                except OSError as exc:
                    logger.warning("failed to delete %s: %s", item.mediaPath, exc)
                    continue
            item.deletedFromServerAt = now

        db.commit()
        return len(expired)
    finally:
        db.close()


def main() -> None:
    logger.info("scheduler started, polling every %ds", POLL_INTERVAL_SECONDS)
    while True:
        try:
            count = expire_once()
            if count:
                logger.info("expired %d item(s)", count)
        except Exception:  # noqa: BLE001 - keep the loop alive across transient errors
            logger.exception("scheduler tick failed")
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
