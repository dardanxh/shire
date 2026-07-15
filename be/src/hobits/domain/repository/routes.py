"""FastAPI routes for the Repository domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.core.pagination import Page, PaginationParams
from hobits.domain.repository.schemas import (
    BranchesResult,
    BranchNamesResult,
    IngestRepositoryRequest,
    RepositoryResult,
    SwitchBranchRequest,
)
from hobits.domain.repository.services import RepositoryService

router = APIRouter(prefix="/repositories", tags=["repositories"])


@router.post("", response_model=RepositoryResult, status_code=status.HTTP_201_CREATED)
def ingest_repository(
    body: IngestRepositoryRequest, session: Session = Depends(get_session)
) -> RepositoryResult:
    """Clone and analyze a repository from a git URL (blocking)."""
    return RepositoryService(session).ingest(body.url, body.connection_id, body.tool_ids)


@router.get("", response_model=Page[RepositoryResult])
def list_repositories(
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[RepositoryResult]:
    return RepositoryService(session).list(params)


@router.get("/{repository_id}", response_model=RepositoryResult)
def get_repository(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> RepositoryResult:
    return RepositoryService(session).get(repository_id)


@router.get("/{repository_id}/branches", response_model=BranchesResult)
def repository_branches(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> BranchesResult:
    """Live branch overview: count, merged/stale tallies, and the most active branch tips."""
    return RepositoryService(session).branches(repository_id)


@router.get("/{repository_id}/branches/names", response_model=BranchNamesResult)
def repository_branch_names(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> BranchNamesResult:
    """Every branch name (cheap, no per-branch plumbing) — for branch pickers."""
    return RepositoryService(session).branch_names(repository_id)


@router.post("/{repository_id}/refresh", response_model=RepositoryResult)
def refresh_repository(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> RepositoryResult:
    """Pull the latest from the remote and re-run the full analysis."""
    return RepositoryService(session).refresh(repository_id)


@router.post("/{repository_id}/branch", response_model=RepositoryResult)
def switch_repository_branch(
    repository_id: uuid.UUID,
    body: SwitchBranchRequest,
    session: Session = Depends(get_session),
) -> RepositoryResult:
    """Check out a branch, clear generated artifacts, and re-run the full analysis (blocking)."""
    return RepositoryService(session).switch_branch(repository_id, body.branch)


@router.delete("/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(repository_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    """Delete a repository and everything derived from it (analysis, artifacts, hobit runs,
    briefing items, and the clone). A local repo's own files are left untouched."""
    RepositoryService(session).delete(repository_id)
