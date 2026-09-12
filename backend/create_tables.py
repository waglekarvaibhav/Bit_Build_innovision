"""Create database tables using the configured direct/admin connection."""
from sqlalchemy import create_engine

from . import models  # noqa: F401 ensure models are registered
from .config import settings
from .database import Base


if __name__ == "__main__":
    url = settings.sqlalchemy_admin_database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    admin_engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
    try:
        Base.metadata.create_all(bind=admin_engine)
        print("Tables ensured.")
    finally:
        admin_engine.dispose()
