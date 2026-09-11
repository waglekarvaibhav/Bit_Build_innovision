"""Database engine, session factory, and Base.

Used a separate local SQLite database by default so the CrewNest demo never
touches HandyHire's Neon database. Set DATABASE_URL in .env to target a real
PostgreSQL instance later.
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


def _build_engine():
    url = settings.sqlalchemy_database_url
    if url.startswith("sqlite"):
        # check_same_thread=False is required for FastAPI's threadpool usage.
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            pool_pre_ping=False,
        )
    # PostgreSQL
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        pool_recycle=300,
    )


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
