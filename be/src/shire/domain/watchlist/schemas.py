"""Pydantic I/O schemas for the Watchlist domain (daily "what changed" digest)."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from shire.domain.repository.schemas import RepositoryResult
from shire.domain.substrate.schemas import (
    AnalysisDeltaResult,
    AnalysisSnapshotSummary,
    CommitActivityResult,
)


class WatchRequest(BaseModel):
    """Add or remove a repository from the watchlist."""

    watched: bool


class WatchlistEntryResult(BaseModel):
    """One watched repository's digest state.

    `delta` is the full deterministic diff from the review cursor to the latest snapshot
    (commits + authors, fact/dependency/contributor shifts, and the AI narrative when one
    has been generated for that pair). None when there is nothing pending: the repo is
    up to date, or only a single baseline snapshot exists.
    """

    repository: RepositoryResult
    latest: AnalysisSnapshotSummary | None
    # The snapshot the user last marked reviewed (resolved from the stored cursor sha);
    # None when never reviewed or the cursor's snapshot no longer exists.
    reviewed: AnalysisSnapshotSummary | None
    delta: AnalysisDeltaResult | None
    # When up to date: the window that was just reviewed (previous cursor -> cursor),
    # so the card can offer it collapsed instead of losing it. None when never reviewed
    # or the previous cursor's snapshot no longer exists.
    reviewed_delta: AnalysisDeltaResult | None = None
    # A change-summary job for the pending pair is queued/running (the UI shows
    # "Summarizing…" and polls until the narrative lands on `delta.note`).
    summary_pending: bool
    # True when the cursor sits on the latest snapshot — nothing new to inspect.
    up_to_date: bool


class WatchlistResult(BaseModel):
    entries: list[WatchlistEntryResult]


class WatchlistRefreshResult(BaseModel):
    """Repositories queued for a pull + re-analysis (busy ones are skipped)."""

    queued_repository_ids: list[uuid.UUID]


class PulseEntryResult(BaseModel):
    """One repository's activity within the Pulse window."""

    repository: RepositoryResult
    # None when the repository has no completed analysis yet (nothing to aggregate).
    activity: CommitActivityResult | None
    # Cached "what has been accomplished" narrative for (repo, window start, head commit).
    summary: str | None
    summary_generated_at: datetime | None
    summary_pending: bool


class PulseResult(BaseModel):
    since: datetime
    # Exclusive upper bound of the window; None = open-ended ("until now").
    until: datetime | None = None
    entries: list[PulseEntryResult]


class PulseSummarizeRequest(BaseModel):
    """Generate accomplishment summaries for the given repos' current Pulse window.
    Empty/None repository_ids = every repository in the comparison (all repos)."""

    since: datetime
    # Exclusive upper bound of the window; None = open-ended ("until now").
    until: datetime | None = None
    repository_ids: list[uuid.UUID] | None = None
