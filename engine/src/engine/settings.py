"""Engine service settings (12-factor, via environment / .env)."""

from __future__ import annotations

import os
import socket
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class EngineSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ENGINE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Plain psycopg DSN (no SQLAlchemy +psycopg driver suffix).
    database_url: str = Field(default="postgresql://shire:shire@localhost:5433/shire")

    claude_binary: str = Field(default="claude")

    # Opt in to paid API-key auth: when true, ANTHROPIC_API_KEY is passed through to the
    # claude subprocess instead of stripped. Default false = subscription auth (key stripped).
    use_api_key: bool = Field(default=False)

    # Jobs this instance runs concurrently; each is a full `claude -p` subprocess.
    concurrency: int = Field(default=2)

    # LISTEN wait / claim-poll fallback cadence. Notifications make claiming instant; this bound
    # is how long a pending job can sit if every notification were lost.
    poll_interval_seconds: float = Field(default=5.0)

    # How often any live worker scans for jobs stuck in `running` (dead-worker recovery).
    stale_sweep_interval_seconds: float = Field(default=60.0)

    # A job swept back from a dead worker is retried until it has consumed this many attempts.
    max_attempts: int = Field(default=2)

    worker_id: str = Field(default_factory=lambda: f"{socket.gethostname()}:{os.getpid()}")


@lru_cache(maxsize=1)
def get_settings() -> EngineSettings:
    return EngineSettings()
