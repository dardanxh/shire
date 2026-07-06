"""SQLAlchemy persistence for the Repository aggregate (ORM row + mapper + repository)."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from hobits.repository.domain.models import Repository
from hobits.repository.domain.value_objects import (
    GitProvider,
    IngestionStatus,
    RepoCoordinates,
    RepoUrl,
)
from hobits.shared.infrastructure.db import Base


class RepositoryRow(Base):
    __tablename__ = "repositories"
    __table_args__ = (UniqueConstraint("provider", "owner", "name", name="uq_repo_coordinates"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    owner: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(1024))
    default_branch: Mapped[str] = mapped_column(String(255), default="main")
    clone_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(32))
    last_analyzed_commit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def _to_domain(row: RepositoryRow) -> Repository:
    return Repository(
        id=row.id,
        coordinates=RepoCoordinates(
            provider=GitProvider(row.provider), owner=row.owner, name=row.name
        ),
        url=RepoUrl(value=row.url),
        default_branch=row.default_branch,
        clone_path=row.clone_path,
        status=IngestionStatus(row.status),
        last_analyzed_commit=row.last_analyzed_commit,
        last_analyzed_at=row.last_analyzed_at,
        error=row.error,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _apply(row: RepositoryRow, repo: Repository) -> None:
    row.id = repo.id
    row.provider = repo.coordinates.provider.value
    row.owner = repo.coordinates.owner
    row.name = repo.coordinates.name
    row.url = repo.url.value
    row.default_branch = repo.default_branch
    row.clone_path = repo.clone_path
    row.status = repo.status.value
    row.last_analyzed_commit = repo.last_analyzed_commit
    row.last_analyzed_at = repo.last_analyzed_at
    row.error = repo.error
    row.created_at = repo.created_at
    row.updated_at = repo.updated_at


class SqlRepositoryRepository:
    """Concrete `RepositoryRepository` port bound to a SQLAlchemy session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, repository: Repository) -> None:
        row = RepositoryRow()
        _apply(row, repository)
        self._session.add(row)

    def save(self, repository: Repository) -> None:
        row = self._session.get(RepositoryRow, repository.id)
        if row is None:
            self.add(repository)
            return
        _apply(row, repository)

    def get(self, repository_id: uuid.UUID) -> Repository | None:
        row = self._session.get(RepositoryRow, repository_id)
        return _to_domain(row) if row else None

    def get_by_coordinates(self, coordinates: RepoCoordinates) -> Repository | None:
        stmt = select(RepositoryRow).where(
            RepositoryRow.provider == coordinates.provider.value,
            RepositoryRow.owner == coordinates.owner,
            RepositoryRow.name == coordinates.name,
        )
        row = self._session.scalars(stmt).first()
        return _to_domain(row) if row else None

    def list(self) -> list[Repository]:
        stmt = select(RepositoryRow).order_by(RepositoryRow.created_at.desc())
        return [_to_domain(r) for r in self._session.scalars(stmt)]
