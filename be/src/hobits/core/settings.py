"""Application settings (12-factor, via environment / .env)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="HOBITS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Postgres (pgvector). Host port 5433 -> container 5432 (see docker-compose.yml).
    database_url: str = Field(
        default="postgresql+psycopg://hobits:hobits@localhost:5433/hobits",
    )

    # Where cloned repositories live on the local filesystem.
    clone_root: Path = Field(default=Path(".data/repos"))

    # Where generated codebase-graph artifacts (emerge HTML apps) are written,
    # keyed by repository id. Served read-only under /api/v1/graph-artifacts.
    graph_root: Path = Field(default=Path(".data/graph"))

    # Where the other visualization artifacts live (git-of-theseus SVGs,
    # code-maat coupling JSON, CodeCharta maps), under <root>/<tool>/<repo_id>/.
    # Served read-only under /api/v1/artifacts.
    artifacts_root: Path = Field(default=Path(".data/artifacts"))

    # Optional GitHub token for richer metadata + higher rate limits + private repos.
    github_token: str | None = Field(default=None)

    # Key used to encrypt connection credentials at rest (Fernet). A urlsafe-base64 32-byte
    # Fernet key is used directly; any other string is stretched via SHA-256. If unset, an
    # insecure dev key is derived (a warning is logged) so local dev works without config.
    secret_key: str | None = Field(default=None)

    # Embedding dimension reserved for the (Phase-1-scaffolded) semantic index.
    embedding_dim: int = Field(default=384)

    # Hobit engine — the Claude Code CLI (`claude -p`) that hobit runs shell out to. Runs on the
    # logged-in Max subscription ($0); do NOT set ANTHROPIC_API_KEY or it switches to paid API auth.
    claude_binary: str = Field(default="claude")
    claude_model: str = Field(default="sonnet")
    claude_timeout_seconds: float = Field(default=500.0)

    # Orchestration (Phase 2.5) — scheduled, change-gated hobit runs via Prefect. Off by default so
    # the app runs standalone; flip on once the Prefect server + worker are up (see
    # docs/running-phase-2.5.md). When off, assignment saves never reach out to Prefect and the
    # startup schedule-reconcile is skipped. `prefect_api_url` mirrors Prefect's own PREFECT_API_URL
    # so the app and CLI point at the same server; `prefect_work_pool` is the process pool the
    # worker polls.
    scheduler_enabled: bool = Field(default=False)
    prefect_api_url: str | None = Field(default=None)
    prefect_work_pool: str = Field(default="hobits-pool")

    def ensure_dirs(self) -> None:
        self.clone_root.mkdir(parents=True, exist_ok=True)
        self.graph_root.mkdir(parents=True, exist_ok=True)
        self.artifacts_root.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
