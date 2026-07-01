"""Database engine and session factory."""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

_engine = None
_SessionLocal = None


def _clean_db_url(url: str) -> str:
    """Remove Prisma-specific query params (schema=public) that psycopg2 doesn't understand."""
    if "?schema=" in url:
        url = url.split("?schema=")[0]
    return url


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(
            _clean_db_url(settings.database_url),
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
        )
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _SessionLocal


def get_session() -> Session:
    return get_session_factory()()
