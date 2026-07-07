"""Database engine, session, and the ORM declarative base.

Sync SQLAlchemy 2.0 + psycopg3. FastAPI endpoints are defined as sync functions and run in a
threadpool, so we avoid async-DB complexity while staying non-blocking at the server level.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from hobits.core.settings import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


_settings = get_settings()
engine = create_engine(_settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=True, expire_on_commit=False)


@contextmanager
def unit_of_work() -> Iterator[Session]:
    """Transactional scope: commit on success, roll back on error."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a session with a managed transaction."""
    with unit_of_work() as session:
        yield session
