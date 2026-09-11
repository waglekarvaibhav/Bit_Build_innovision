"""Reset the development database.

SAFETY: This destroys data. It refuses to run if DATABASE_URL points anywhere
but a local development SQLite database, so it can never reset an external or
production database.
"""
from __future__ import annotations

import sys

from .config import settings, load_dotenv_manual


def _confirm(message: str) -> bool:
    if "--yes" in sys.argv:
        return True
    sys.stdout.write(f"{message} [y/N] ")
    sys.stdout.flush()
    answer = sys.stdin.readline().strip().lower()
    return answer in ("y", "yes")


def main() -> None:
    load_dotenv_manual()

    url = settings.sqlalchemy_database_url
    if not url.startswith("sqlite"):
        print(
            "Refusing to reset: configure a development SQLite database "
            "(e.g. leave DATABASE_URL empty), not an external database."
        )
        sys.exit(1)

    if not _confirm("This will WIPE the local development CrewNest database. Continue?"):
        print("Aborted.")
        sys.exit(0)

    import os
    from pathlib import Path

    sqlite_path = url.replace("sqlite:///", "")
    if sqlite_path and not os.path.isabs(sqlite_path):
        sqlite_path = str(Path(sqlite_path).resolve())
    if os.path.exists(sqlite_path):
        os.remove(sqlite_path)
        print(f"Removed {sqlite_path}")

    from .database import Base, engine
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    print("Created a fresh CrewNest development database.")


if __name__ == "__main__":
    main()
