"""Verify the configured database connection without exposing credentials."""
from sqlalchemy import text

from .database import engine


if __name__ == "__main__":
    with engine.connect() as connection:
        database_name = connection.execute(text("SELECT current_database()"))
        name = database_name.scalar_one()
        print(f"Database connection successful: {name}")
