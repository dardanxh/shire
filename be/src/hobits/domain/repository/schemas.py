"""Pydantic I/O schemas for the Repository domain (Create / Result)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from hobits.domain.repository.domain import Repository


class IngestRepositoryRequest(BaseModel):
    """Create input: a git URL to clone + analyze, optionally via a stored connection."""

    url: str
    connection_id: uuid.UUID | None = None


class RepositoryResult(BaseModel):
    """Result schema returned by the service/routes (never a SQLAlchemy entity)."""

    id: uuid.UUID
    provider: str
    owner: str
    name: str
    slug: str
    url: str
    connection_id: uuid.UUID | None
    default_branch: str
    status: str
    last_analyzed_commit: str | None
    last_analyzed_at: datetime | None
    error: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, repo: Repository) -> RepositoryResult:
        return cls(
            id=repo.id,
            provider=repo.coordinates.provider.value,
            owner=repo.coordinates.owner,
            name=repo.coordinates.name,
            slug=repo.coordinates.slug,
            url=repo.url.value,
            connection_id=repo.connection_id,
            default_branch=repo.default_branch,
            status=repo.status.value,
            last_analyzed_commit=repo.last_analyzed_commit,
            last_analyzed_at=repo.last_analyzed_at,
            error=repo.error,
            created_at=repo.created_at,
            updated_at=repo.updated_at,
        )
