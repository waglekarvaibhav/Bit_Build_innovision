"""Application configuration.

Values come from environment variables (via .env when run through the seed/start
helpers) with sensible local-development defaults. No credentials are required
for the core demo: the default uses a local SQLite database.
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Central, environment-driven settings for CrewNest."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        extra="ignore",
    )

    # --- Database ---
    # Leave empty to use the local SQLite demo database.
    database_url: str = ""
    # Optional direct/unpooled PostgreSQL URL for schema/admin operations.
    database_url_unpooled: str = ""

    # --- Security ---
    # Auto-generate a dev secret if none supplied (stable only for the process
    # lifetime; set SECRET_KEY in production/.env for stable tokens across runs).
    secret_key: str = ""
    access_token_expire_minutes: int = 60
    algorithm: str = "HS256"

    # --- Server ---
    # 0.0.0.0 works both locally and on hosted platforms that expose the app
    # through a container/service network. PORT/HOST can still override this.
    host: str = "0.0.0.0"
    port: int = 8001
    allowed_origins: str = "http://localhost:8001,http://127.0.0.1:8001"

    # --- Uploads ---
    upload_dir: str = "./uploads"

    _generated_secret: str | None = None

    @property
    def effective_secret_key(self) -> str:
        if self.secret_key:
            return self.secret_key
        # Cache one generated secret for the process lifetime so tokens issued
        # by one request remain valid for the next. Set SECRET_KEY in .env for
        # stable tokens across restarts.
        if self._generated_secret is None:
            self._generated_secret = secrets.token_hex(32)
        return self._generated_secret

    @property
    def sqlalchemy_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{(BASE_DIR / 'crewneat.db').as_posix()}"

    @property
    def sqlalchemy_admin_database_url(self) -> str:
        """Direct DB URL for schema/admin tasks, falling back to app URL."""
        if self.database_url_unpooled:
            return self.database_url_unpooled
        return self.sqlalchemy_database_url

    @property
    def origin_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def absolute_upload_dir(self) -> Path:
        p = Path(self.upload_dir)
        if not p.is_absolute():
            p = BASE_DIR / p
        return p


settings = Settings()


def load_dotenv_manual() -> None:
    """Minimal .env loader so helpers work without extra deps.

    pydantic-settings already reads .env for the Settings fields; this is kept
    as a small fallback for any tooling that needs raw env values.
    """
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)
