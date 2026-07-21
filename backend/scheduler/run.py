from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.download_item import DownloadItem
from app.models.monitored_source import MonitoredSource
from app.services import source_service

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
            .where(DownloadItem.keepOnServer.is_(False))
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


def check_due_sources_once() -> int:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        due_ids = [
            row.id
            for row in db.execute(
                select(MonitoredSource.id)
                .where(MonitoredSource.enabled.is_(True))
                .where(MonitoredSource.checking.is_(False))
                .where(MonitoredSource.nextCheckAt.is_not(None))
                .where(MonitoredSource.nextCheckAt <= now)
            )
        ]
    finally:
        db.close()

    for source_id in due_ids:
        try:
            asyncio.run(source_service.check_source(source_id))
        except Exception:  # noqa: BLE001 - one broken source must not stop the others
            logger.exception("source check failed for %s", source_id)
    return len(due_ids)


def main() -> None:
    logger.info("scheduler started, polling every %ds", POLL_INTERVAL_SECONDS)
    while True:
        try:
            count = expire_once()
            if count:
                logger.info("expired %d item(s)", count)
        except Exception:  # noqa: BLE001 - keep the loop alive across transient errors
            logger.exception("scheduler tick failed")

        try:
            checked = check_due_sources_once()
            if checked:
                logger.info("checked %d due source(s)", checked)
        except Exception:  # noqa: BLE001 - keep the loop alive across transient errors
            logger.exception("source check tick failed")

        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
