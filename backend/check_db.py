"""Verify the configured database connection without exposing credentials."""
from sqlalchemy import text

from .database import engine


if __name__ == "__main__":
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        if engine.dialect.name == "postgresql":
            name = connection.execute(text("SELECT current_database()" )).scalar_one()
            print(f"PostgreSQL connection successful: {name}")
        else:
            print(f"Database connection successful: {engine.dialect.name}")
