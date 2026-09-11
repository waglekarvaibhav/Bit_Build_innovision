"""Create tables (dev convenience). Uses the configured database."""
from .database import Base, engine
from . import models  # noqa: F401 ensure models are registered

if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    print("Tables ensured.")
