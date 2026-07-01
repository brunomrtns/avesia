"""Redis client for Celery broker and pub/sub."""

import redis as redis_lib

from .config import get_settings

_redis_client: redis_lib.Redis | None = None


def get_redis() -> redis_lib.Redis:
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = redis_lib.from_url(settings.redis_url, decode_responses=True)
    return _redis_client
