"""Watchlist service: the daily "what changed since I last looked" digest.

A thin read-model over existing machinery: repositories carry the `watched` flag and the
review cursor (`last_reviewed_commit_sha`); the substrate's snapshot history + delta diff
do the heavy lifting. Marking a repo reviewed advances the cursor to the latest snapshot,
so the next digest only shows commits that haven't been inspected yet.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError
from shire.domain.repository.domain import IngestionStatus, Repository
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.domain.repository.schemas import RepositoryResult
from shire.domain.repository.services import RepositoryService
from shire.domain.substrate.services import AnalysisService
from shire.domain.watchlist.schemas import (
    WatchlistEntryResult,
    WatchlistRefreshResult,
    WatchlistResult,
)

_BUSY = (IngestionStatus.cloning, IngestionStatus.analyzing)


class WatchlistService:
    """Business logic for the watchlist. Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._repos = SqlRepositoryRepository(session)
        self._analysis = AnalysisService(session)

    def digest(self) -> WatchlistResult:
        return WatchlistResult(
            entries=[self._entry(repo) for repo in self._repos.list_watched()]
        )

    def _entry(self, repo: Repository) -> WatchlistEntryResult:
        history = self._analysis.analysis_history(repo.id)  # oldest first
        latest = history[-1] if history else None
        reviewed = None
        if repo.last_reviewed_commit_sha:
            reviewed = next(
                (s for s in history if s.commit_sha == repo.last_reviewed_commit_sha), None
            )

        delta = None
        if latest is not None:
            if reviewed is not None and reviewed.analysis_id != latest.analysis_id:
                delta = self._analysis.analysis_delta(
                    repo.id, reviewed.analysis_id, latest.analysis_id
                )
            elif reviewed is None and len(history) >= 2:
                # Never reviewed: everything since onboarding is uninspected.
                delta = self._analysis.analysis_delta(
                    repo.id, history[0].analysis_id, latest.analysis_id
                )

        return WatchlistEntryResult(
            repository=RepositoryResult.of(repo),
            latest=latest,
            reviewed=reviewed,
            delta=delta,
            up_to_date=bool(
                latest is not None
                and reviewed is not None
                and reviewed.analysis_id == latest.analysis_id
            ),
        )

    def set_watched(self, repository_id: uuid.UUID, watched: bool) -> RepositoryResult:
        repo = self._require(repository_id)
        repo.watched = watched
        self._repos.save(repo)
        return RepositoryResult.of(repo)

    def mark_reviewed(self, repository_id: uuid.UUID) -> WatchlistEntryResult:
        """Advance the review cursor to the latest snapshot — its commits are now 'seen'."""
        repo = self._require(repository_id)
        history = self._analysis.analysis_history(repository_id)
        if not history:
            raise ConflictError("No completed analysis to mark reviewed yet.")
        repo.last_reviewed_commit_sha = history[-1].commit_sha
        self._repos.save(repo)
        return self._entry(repo)

    def refresh_all(self) -> WatchlistRefreshResult:
        """Mark every idle watched repo for a pull + re-analysis. The route schedules the
        actual pipeline runs as background tasks; busy repos are skipped, not queued twice."""
        repos = RepositoryService(self._session)
        queued: list[uuid.UUID] = []
        for repo in self._repos.list_watched():
            if repo.status in _BUSY:
                continue
            repos.refresh(repo.id)
            queued.append(repo.id)
        return WatchlistRefreshResult(queued_repository_ids=queued)

    def _require(self, repository_id: uuid.UUID) -> Repository:
        repo = self._repos.get(repository_id)
        if repo is None:
            raise NotFoundError("Repository not found")
        return repo
