from __future__ import annotations

from functools import lru_cache

import redis
from rq import Queue

from app.core.config import settings

QUEUE_NAME = "downloads"


@lru_cache
def get_redis_connection():
    return redis.from_url(settings.REDIS_URL)


def get_queue() -> Queue:
    return Queue(QUEUE_NAME, connection=get_redis_connection())
