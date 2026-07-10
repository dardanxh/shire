"""FastAPI routes for the Repository domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.core.pagination import Page, PaginationParams
from hobits.domain.repository.schemas import IngestRepositoryRequest, RepositoryResult
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


@router.post("/{repository_id}/refresh", response_model=RepositoryResult)
def refresh_repository(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> RepositoryResult:
    """Pull the latest from the remote and re-run the full analysis."""
    return RepositoryService(session).refresh(repository_id)


@router.delete("/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    """Delete a repository and everything derived from it (analysis, artifacts, hobit runs,
    briefing items, and the clone). A local repo's own files are left untouched."""
    RepositoryService(session).delete(repository_id)
