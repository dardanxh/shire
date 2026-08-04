"""Watchlist service: the daily "what changed since I last looked" digest.

A thin read-model over existing machinery: repositories carry the `watched` flag and the
review cursor (`last_reviewed_commit_sha`); the substrate's snapshot history + delta diff
do the heavy lifting. Marking a repo reviewed advances the cursor to the latest snapshot,
so the next digest only shows commits that haven't been inspected yet.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

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
from shire.domain.watchlist.models import PulseSummaryRow
from shire.domain.watchlist.schemas import (
    PulseEntryResult,
    PulseResult,
    PulseSummarizeRequest,
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
        return WatchlistResult(entries=[self._entry(repo) for repo in self._repos.list_watched()])

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

        up_to_date = bool(
            latest is not None
            and reviewed is not None
            and reviewed.analysis_id == latest.analysis_id
        )

        # Up to date: still serve the window that was just reviewed (rendered collapsed) so
        # marking reviewed closes the card without destroying what it showed.
        reviewed_delta = None
        if up_to_date:
            prev = _resolve_cursor(history, repo.prev_reviewed_commit_sha)
            if (
                prev is not None
                and reviewed is not None
                and prev.analysis_id != reviewed.analysis_id
            ):
                reviewed_delta = self._analysis.analysis_delta(
                    repo.id, prev.analysis_id, reviewed.analysis_id
                )

        return WatchlistEntryResult(
            repository=RepositoryResult.of(repo),
            latest=latest,
            reviewed=reviewed,
            delta=delta,
            reviewed_delta=reviewed_delta,
            summary_pending=summary_pending,
            up_to_date=up_to_date,
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
        self._analysis.enqueue_delta_note(repository_id, ExplainDelta(from_id=from_id, to_id=to_id))

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
        """Advance the review cursor to the latest snapshot — its commits are now 'seen'.
        The old cursor is kept as the previous cursor so the just-reviewed window stays
        viewable (collapsed) on the card."""
        repo = self._require(repository_id)
        history = self._analysis.analysis_history(repository_id)
        if not history:
            raise ConflictError("No completed analysis to mark reviewed yet.")
        latest_sha = history[-1].commit_sha
        if repo.last_reviewed_commit_sha != latest_sha:
            # Never-reviewed windows start at the baseline — that's what the user just read.
            repo.prev_reviewed_commit_sha = repo.last_reviewed_commit_sha or history[0].commit_sha
        repo.last_reviewed_commit_sha = latest_sha
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

    # --- pulse (cross-repo activity comparison) --------------------------------
    def pulse(
        self,
        since: datetime,
        repository_ids: list[uuid.UUID] | None = None,
        until: datetime | None = None,
    ) -> PulseResult:
        """Activity of the selected repos (all repos when unselected) from `since` on,
        up to (excluding) `until` when given: commit totals, contributors, per-day
        counts, and the cached accomplishment summary for the window."""
        repos = self._pulse_targets(repository_ids)
        return PulseResult(
            since=since,
            until=until,
            entries=[self._pulse_entry(repo, since, until) for repo in repos],
        )

    def _pulse_entry(
        self, repo: Repository, since: datetime, until: datetime | None
    ) -> PulseEntryResult:
        activity = self._analysis.commit_activity_since(repo.id, since, until)
        until_date = until.date() if until else None
        summary_row = None
        summary_pending = False
        if repo.last_analyzed_commit:
            summary_row = self._get_pulse_summary(
                repo.id, since.date(), until_date, repo.last_analyzed_commit
            )
            if summary_row is None:
                summary_pending = self._pulse_job_pending(repo.id, since.date(), until_date)
        return PulseEntryResult(
            repository=RepositoryResult.of(repo),
            activity=activity,
            summary=summary_row.narrative if summary_row else None,
            summary_generated_at=summary_row.created_at if summary_row else None,
            summary_pending=summary_pending,
        )

    def enqueue_pulse_summaries(self, body: PulseSummarizeRequest) -> list[uuid.UUID]:
        """Queue one accomplishment-summary job per selected repo that has activity in the
        window and no cached narrative for it. Returns the repo ids actually queued."""
        since = body.since
        until = body.until
        until_date = until.date() if until else None
        queued: list[uuid.UUID] = []
        for repo in self._pulse_targets(body.repository_ids):
            if not repo.clone_path or not repo.last_analyzed_commit:
                continue
            activity = self._analysis.commit_activity_since(repo.id, since, until)
            if activity is None or activity.commits == 0:
                continue
            if self._get_pulse_summary(
                repo.id, since.date(), until_date, repo.last_analyzed_commit
            ):
                continue
            if self._pulse_job_pending(repo.id, since.date(), until_date):
                continue
            self._enqueue_pulse_summary(repo, since, activity.commits, until)
            queued.append(repo.id)
        return queued

    def _enqueue_pulse_summary(
        self,
        repo: Repository,
        since: datetime,
        commit_count: int,
        until: datetime | None,
    ) -> None:
        from shire.domain.jobs.services import JobService
        from shire.integrations.git_history import commit_subjects_since

        jobs = JobService(self._session)
        model, timeout_seconds = jobs.engine_defaults()
        commit_log = commit_subjects_since(
            Path(repo.clone_path or ""), since, repo.coordinates.subpath, until
        )
        jobs.enqueue(
            kind=job_kinds.PULSE_SUMMARY,
            title=f"Pulse summary — {repo.coordinates.slug}",
            prompt=_PULSE_SUMMARY_PROMPT.format(
                repo=repo.coordinates.slug,
                window=_window_description(since, until),
                commit_log=commit_log or "(commit subjects unavailable)",
                commit_count=commit_count,
            ),
            payload={
                "cwd": repo.analysis_path,
                "model": model,
                "timeout_seconds": timeout_seconds,
                "repository_id": str(repo.id),
                "since_date": since.date().isoformat(),
                "until_date": until.date().isoformat() if until else None,
                "head_sha": repo.last_analyzed_commit or "",
            },
            repository_id=repo.id,
        )

    def _pulse_targets(self, repository_ids: list[uuid.UUID] | None) -> list[Repository]:
        if repository_ids:
            wanted = set(repository_ids)
            return [r for r in self._repos.list() if r.id in wanted]
        return self._repos.list()

    def _get_pulse_summary(
        self,
        repository_id: uuid.UUID,
        since_date: date,
        until_date: date | None,
        head_sha: str,
    ) -> PulseSummaryRow | None:
        from sqlalchemy import select

        return self._session.scalars(
            select(PulseSummaryRow).where(
                PulseSummaryRow.repository_id == repository_id,
                PulseSummaryRow.since_date == since_date,
                PulseSummaryRow.until_date.is_(None)
                if until_date is None
                else PulseSummaryRow.until_date == until_date,
                PulseSummaryRow.head_sha == head_sha,
            )
        ).first()

    def _pulse_job_pending(
        self, repository_id: uuid.UUID, since_date: date, until_date: date | None
    ) -> bool:
        rows = SqlJobRepository(self._session).list(
            status=None,
            repository_id=repository_id,
            kind=job_kinds.PULSE_SUMMARY,
            limit=10,
            offset=0,
        )
        return any(
            row.status in ("queued", "running")
            and (row.payload or {}).get("since_date") == since_date.isoformat()
            and (row.payload or {}).get("until_date")
            == (until_date.isoformat() if until_date else None)
            for row in rows
        )

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


def _window_description(since: datetime, until: datetime | None) -> str:
    """Human phrasing of the Pulse window for the summary prompt. `until` is an exclusive
    midnight bound, so the last covered day is the moment just before it."""
    if until is None:
        return f"since {since.date().isoformat()}"
    last_day = (until - timedelta(seconds=1)).date()
    return f"between {since.date().isoformat()} and {last_day.isoformat()}"


_PULSE_SUMMARY_PROMPT = """You are writing a quick "what has been accomplished" note for \
repository {repo}, covering the work landed {window} — one panel of a \
cross-repository activity comparison.

The commits in this window (newest first, `sha author: subject`), {commit_count} total:
{commit_log}

You may verify claims by reading files in the working tree (Read/Grep/Glob only — you \
cannot run git, and you must not modify anything). The commit subjects are your primary \
evidence.

Write at most ~80 words of plain markdown: 2-4 bullets describing what got DONE, in \
outcome language (features shipped, fixes landed, refactors completed, docs written). \
Merge related commits into one bullet. No headings, no shas, no contributor names (shown \
separately). Begin your reply DIRECTLY with the first bullet — any text before it will be \
discarded. If the window holds no meaningful work, reply with a single short line saying so."""
