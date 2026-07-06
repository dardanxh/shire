"""Ports (interfaces) for the Repository bounded context.

The domain declares what it needs; infrastructure implements these. The domain never imports
SQLAlchemy, GitPython, or httpx.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from hobits.repository.domain.models import Repository
from hobits.repository.domain.value_objects import RepoCoordinates
from hobits.shared.domain.base import ValueObject


class ProviderMetadata(ValueObject):
    default_branch: str | None = None
    description: str | None = None


class CloneOutcome(ValueObject):
    clone_path: str
    default_branch: str
    head_sha: str


class RepositoryRepository(Protocol):
    """Persistence port for the Repository aggregate."""

    def add(self, repository: Repository) -> None: ...
    def save(self, repository: Repository) -> None: ...
    def get(self, repository_id: uuid.UUID) -> Repository | None: ...
    def get_by_coordinates(self, coordinates: RepoCoordinates) -> Repository | None: ...
    def list(self) -> list[Repository]: ...


class GitProviderClient(Protocol):
    """Fetches provider-side metadata (best-effort; may return None)."""

    def fetch_metadata(self, url: str) -> ProviderMetadata | None: ...


class CloneService(Protocol):
    """Clones (or updates) a repository into a local workspace."""

    def clone(self, url: str, coordinates: RepoCoordinates) -> CloneOutcome: ...
