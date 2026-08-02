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
from shire.domain.jobs import kinds as job_kinds
from shire.domain.jobs.repositories import SqlJobRepository
from shire.domain.repository.domain import IngestionStatus, Repository
from shire.domain.repository.repositories import SqlRepositoryRepository
from shire.domain.repository.schemas import RepositoryResult
from shire.domain.repository.services import RepositoryService
from shire.domain.substrate.schemas import AnalysisSnapshotSummary, ExplainDelta
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
        reviewed = _resolve_cursor(history, repo.last_reviewed_commit_sha)

        delta = None
        summary_pending = False
        pair = _pending_pair(history, reviewed)
        if pair is not None:
            delta = self._analysis.analysis_delta(repo.id, *pair)
            if delta.note is None:
                summary_pending = self._summary_job_pending(repo.id, *pair)

        return WatchlistEntryResult(
            repository=RepositoryResult.of(repo),
            latest=latest,
            reviewed=reviewed,
            delta=delta,
            summary_pending=summary_pending,
            up_to_date=bool(
                latest is not None
                and reviewed is not None
                and reviewed.analysis_id == latest.analysis_id
            ),
        )

    def enqueue_pending_summary(self, repository_id: uuid.UUID) -> None:
        """Auto-generate the digest summary for a watched repo's pending delta — called by
        the ingest pipeline after a pull produced a fresh snapshot. Idempotent: skips when
        the pair already has a narrative or a summary job is already queued/running."""
        repo = self._repos.get(repository_id)
        if repo is None or not repo.watched:
            return
        history = self._analysis.analysis_history(repository_id)
        pair = _pending_pair(history, _resolve_cursor(history, repo.last_reviewed_commit_sha))
        if pair is None:
            return
        from_id, to_id = pair
        if self._analysis.has_delta_note(from_id, to_id):
            return
        if self._summary_job_pending(repository_id, from_id, to_id):
            return
        self._analysis.enqueue_delta_note(
            repository_id, ExplainDelta(from_id=from_id, to_id=to_id)
        )

    def _summary_job_pending(
        self, repository_id: uuid.UUID, from_id: uuid.UUID, to_id: uuid.UUID
    ) -> bool:
        """A change-summary job for exactly this snapshot pair is queued or running."""
        rows = SqlJobRepository(self._session).list(
            status=None,
            repository_id=repository_id,
            kind=job_kinds.SUBSTRATE_EVOLUTION_NOTE,
            limit=20,
            offset=0,
        )
        return any(
            row.status in ("queued", "running")
            and (row.payload or {}).get("from_analysis_id") == str(from_id)
            and (row.payload or {}).get("to_analysis_id") == str(to_id)
            for row in rows
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


def _resolve_cursor(
    history: list[AnalysisSnapshotSummary], cursor_sha: str | None
) -> AnalysisSnapshotSummary | None:
    """The snapshot the review cursor points at, or None when unset / no longer present."""
    if not cursor_sha:
        return None
    return next((s for s in history if s.commit_sha == cursor_sha), None)


def _pending_pair(
    history: list[AnalysisSnapshotSummary],
    reviewed: AnalysisSnapshotSummary | None,
) -> tuple[uuid.UUID, uuid.UUID] | None:
    """The (from, to) snapshot pair the digest compares — cursor→latest when reviewed,
    baseline→latest when never reviewed. None when nothing is pending."""
    latest = history[-1] if history else None
    if latest is None:
        return None
    if reviewed is not None and reviewed.analysis_id != latest.analysis_id:
        return reviewed.analysis_id, latest.analysis_id
    if reviewed is None and len(history) >= 2:
        return history[0].analysis_id, latest.analysis_id
    return None
