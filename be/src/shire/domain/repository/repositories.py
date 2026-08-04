"""Data access for the Repository aggregate (SQLAlchemy entities in/out, domain in/out)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shire.domain.repository.domain import (
    GitProvider,
    IngestionStatus,
    RepoCoordinates,
    Repository,
    RepoUrl,
)
from shire.domain.repository.models import RepositoryRow


def _to_domain(row: RepositoryRow) -> Repository:
    return Repository(
        id=row.id,
        coordinates=RepoCoordinates(
            provider=GitProvider(row.provider),
            owner=row.owner,
            name=row.name,
            subpath=row.subpath or "",
        ),
        url=RepoUrl(value=row.url),
        connection_id=row.connection_id,
        default_branch=row.default_branch,
        current_branch=row.current_branch,
        clone_path=row.clone_path,
        status=IngestionStatus(row.status),
        watched=row.watched,
        last_reviewed_commit_sha=row.last_reviewed_commit_sha,
        prev_reviewed_commit_sha=row.prev_reviewed_commit_sha,
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
    row.subpath = repo.coordinates.subpath
    row.url = repo.url.value
    row.connection_id = repo.connection_id
    row.default_branch = repo.default_branch
    row.current_branch = repo.current_branch
    row.clone_path = repo.clone_path
    row.status = repo.status.value
    row.watched = repo.watched
    row.last_reviewed_commit_sha = repo.last_reviewed_commit_sha
    row.prev_reviewed_commit_sha = repo.prev_reviewed_commit_sha
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
            RepositoryRow.subpath == coordinates.subpath,
        )
        row = self._session.scalars(stmt).first()
        return _to_domain(row) if row else None

    def list_watched(self) -> list[Repository]:
        """Watchlist members, oldest-onboarded first (stable digest order)."""
        stmt = (
            select(RepositoryRow)
            .where(RepositoryRow.watched.is_(True))
            .order_by(RepositoryRow.created_at.asc())
        )
        return [_to_domain(r) for r in self._session.scalars(stmt)]

    def list(self, *, limit: int | None = None, offset: int = 0) -> list[Repository]:
        stmt = select(RepositoryRow).order_by(RepositoryRow.created_at.desc()).offset(offset)
        if limit is not None:
            stmt = stmt.limit(limit)
        return [_to_domain(r) for r in self._session.scalars(stmt)]

    def count(self) -> int:
        return self._session.scalar(select(func.count()).select_from(RepositoryRow)) or 0

    def list_families(self, *, limit: int, offset: int) -> list[Repository]:
        """One page of repository *families* — rows sharing provider/owner/name (a monorepo's
        whole-repo record plus its subpath records). Families are ordered newest-onboarded
        first; inside a family the whole-repo record ('' subpath) precedes its subdirectories.
        Paginating by family is what keeps a parent and its subrepos on the same page."""
        newest = func.max(RepositoryRow.created_at).label("newest")
        families = (
            select(RepositoryRow.provider, RepositoryRow.owner, RepositoryRow.name, newest)
            .group_by(RepositoryRow.provider, RepositoryRow.owner, RepositoryRow.name)
            # The owner/name tie-breakers give the families a total order — without one,
            # LIMIT/OFFSET can repeat or skip a family when several share a timestamp.
            .order_by(newest.desc(), RepositoryRow.owner, RepositoryRow.name)
            .limit(limit)
            .offset(offset)
            .subquery("families")
        )
        stmt = (
            select(RepositoryRow)
            .join(
                families,
                (RepositoryRow.provider == families.c.provider)
                & (RepositoryRow.owner == families.c.owner)
                & (RepositoryRow.name == families.c.name),
            )
            .order_by(
                families.c.newest.desc(),
                families.c.owner,
                families.c.name,
                RepositoryRow.subpath,
            )
        )
        return [_to_domain(r) for r in self._session.scalars(stmt)]

    def count_families(self) -> int:
        """Distinct provider/owner/name groups — the page unit for `list_families`."""
        families = (
            select(RepositoryRow.provider, RepositoryRow.owner, RepositoryRow.name)
            .distinct()
            .subquery()
        )
        return self._session.scalar(select(func.count()).select_from(families)) or 0

    def count_clone_sharers(self, coordinates: RepoCoordinates, exclude_id: uuid.UUID) -> int:
        """How many OTHER records point at the same clone on disk (same provider/owner/name,
        any subpath). Guards clone deletion — sibling monorepo records share one clone."""
        return (
            self._session.scalar(
                select(func.count())
                .select_from(RepositoryRow)
                .where(
                    RepositoryRow.provider == coordinates.provider.value,
                    RepositoryRow.owner == coordinates.owner,
                    RepositoryRow.name == coordinates.name,
                    RepositoryRow.id != exclude_id,
                )
            )
            or 0
        )

    def delete(self, repository_id: uuid.UUID) -> None:
        """Delete the repository row. FK-cascaded children (context pack, tool links, hobit
        assignments + runs, briefing items) go with it; analysis snapshots are removed separately
        (they have no FK to repositories)."""
        row = self._session.get(RepositoryRow, repository_id)
        if row is not None:
            self._session.delete(row)
