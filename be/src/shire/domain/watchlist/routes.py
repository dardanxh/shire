"""FastAPI routes for the Watchlist domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.repository.schemas import RepositoryResult
from shire.domain.repository.services import run_ingest_pipeline
from shire.domain.watchlist.schemas import (
    WatchlistEntryResult,
    WatchlistRefreshResult,
    WatchlistResult,
    WatchRequest,
)
from shire.domain.watchlist.services import WatchlistService

router = APIRouter(prefix="/watchlist", tags=["watchlist"])


@router.get("", response_model=WatchlistResult)
def get_watchlist(session: Session = Depends(get_session)) -> WatchlistResult:
    """The daily digest: every watched repo with what changed since it was last reviewed."""
    return WatchlistService(session).digest()


@router.post("/refresh", response_model=WatchlistRefreshResult)
def refresh_watchlist(
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> WatchlistRefreshResult:
    """Pull latest for every idle watched repo (non-blocking; poll the digest for status)."""
    result = WatchlistService(session).refresh_all()
    for repository_id in result.queued_repository_ids:
        background_tasks.add_task(run_ingest_pipeline, repository_id)
    return result


@router.put("/{repository_id}", response_model=RepositoryResult)
def set_watched(
    repository_id: uuid.UUID,
    body: WatchRequest,
    session: Session = Depends(get_session),
) -> RepositoryResult:
    """Add or remove a repository from the watchlist."""
    return WatchlistService(session).set_watched(repository_id, body.watched)


@router.post("/{repository_id}/reviewed", response_model=WatchlistEntryResult)
def mark_reviewed(
    repository_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> WatchlistEntryResult:
    """Advance the review cursor to the latest snapshot — tomorrow's digest starts here."""
    return WatchlistService(session).mark_reviewed(repository_id)
