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

    # Optional GitHub token for richer metadata + higher rate limits + private repos.
    github_token: str | None = Field(default=None)

    # Embedding dimension reserved for the (Phase-1-scaffolded) semantic index.
    embedding_dim: int = Field(default=384)

    def ensure_dirs(self) -> None:
        self.clone_root.mkdir(parents=True, exist_ok=True)
        self.graph_root.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
