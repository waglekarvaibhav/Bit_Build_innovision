"""Run the CrewNest dev server.

Loads .env, ensures tables exist, then serves the API + SPA from one process.
Default port 8001 (Host/port overridable via env). Does NOT auto-seed; run
seed_demo separately for demo accounts.
"""
from __future__ import annotations

from .config import settings, load_dotenv_manual


def main() -> None:
    load_dotenv_manual()
    import uvicorn

    # Ensure tables exist before serving.
    from .database import Base, engine
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
