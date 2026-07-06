"""The Repository aggregate root."""

from __future__ import annotations

from datetime import UTC, datetime

from hobits.repository.domain.value_objects import (
    IngestionStatus,
    RepoCoordinates,
    RepoUrl,
)
from hobits.shared.domain.base import AggregateRoot


def _now() -> datetime:
    return datetime.now(UTC)


class Repository(AggregateRoot):
    """A tracked codebase and its ingestion lifecycle.

    Invariants enforced by the transition methods:
    - a clone path must be recorded before analysis begins;
    - `failed` is reachable from any active state and records the error.
    """

    coordinates: RepoCoordinates
    url: RepoUrl
    default_branch: str = "main"
    clone_path: str | None = None
    status: IngestionStatus = IngestionStatus.registered
    last_analyzed_commit: str | None = None
    last_analyzed_at: datetime | None = None
    error: str | None = None
    created_at: datetime = None  # type: ignore[assignment]
    updated_at: datetime = None  # type: ignore[assignment]

    def model_post_init(self, _context: object) -> None:
        now = _now()
        if self.created_at is None:
            self.created_at = now
        if self.updated_at is None:
            self.updated_at = now

    # --- lifecycle transitions -------------------------------------------------
    def mark_cloning(self) -> None:
        self.status = IngestionStatus.cloning
        self.error = None
        self._touch()

    def mark_cloned(self, clone_path: str, default_branch: str) -> None:
        self.clone_path = clone_path
        self.default_branch = default_branch
        self._touch()

    def mark_analyzing(self) -> None:
        if not self.clone_path:
            raise ValueError("Cannot analyze a repository that has not been cloned.")
        self.status = IngestionStatus.analyzing
        self._touch()

    def mark_ready(self, commit_sha: str) -> None:
        self.status = IngestionStatus.ready
        self.last_analyzed_commit = commit_sha
        self.last_analyzed_at = _now()
        self.error = None
        self._touch()

    def mark_failed(self, error: str) -> None:
        self.status = IngestionStatus.failed
        self.error = error
        self._touch()

    def _touch(self) -> None:
        self.updated_at = _now()
