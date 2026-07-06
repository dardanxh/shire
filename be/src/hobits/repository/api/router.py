"""HTTP API for the Repository bounded context."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from hobits.repository.application.ingest import IngestRepositoryService
from hobits.repository.domain.models import Repository
from hobits.repository.infrastructure.clone import GitCloneService
from hobits.repository.infrastructure.github_client import GithubProviderClient
from hobits.repository.infrastructure.persistence import SqlRepositoryRepository
from hobits.shared.infrastructure.db import get_session
from hobits.shared.infrastructure.settings import get_settings
from hobits.substrate.application.analyze import AnalyzeRepositoryService
from hobits.substrate.infrastructure.git_history import build_scan_context
from hobits.substrate.infrastructure.persistence import SqlAnalysisRepository
from hobits.substrate.infrastructure.scanners import default_scanners

router = APIRouter(prefix="/repositories", tags=["repositories"])


class IngestRequest(BaseModel):
    url: str


class RepositoryOut(BaseModel):
    id: uuid.UUID
    provider: str
    owner: str
    name: str
    slug: str
    url: str
    default_branch: str
    status: str
    last_analyzed_commit: str | None
    last_analyzed_at: datetime | None
    error: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, repo: Repository) -> RepositoryOut:
        return cls(
            id=repo.id,
            provider=repo.coordinates.provider.value,
            owner=repo.coordinates.owner,
            name=repo.coordinates.name,
            slug=repo.coordinates.slug,
            url=repo.url.value,
            default_branch=repo.default_branch,
            status=repo.status.value,
            last_analyzed_commit=repo.last_analyzed_commit,
            last_analyzed_at=repo.last_analyzed_at,
            error=repo.error,
            created_at=repo.created_at,
            updated_at=repo.updated_at,
        )


def _ingest_service(session: Session) -> IngestRepositoryService:
    settings = get_settings()
    settings.ensure_dirs()
    return IngestRepositoryService(
        repo_repo=SqlRepositoryRepository(session),
        clone_service=GitCloneService(settings.clone_root),
        analyze_service=AnalyzeRepositoryService(
            SqlAnalysisRepository(session), default_scanners()
        ),
        context_builder=build_scan_context,
        provider_client=GithubProviderClient(settings.github_token),
    )


@router.post("", response_model=RepositoryOut, status_code=status.HTTP_201_CREATED)
def ingest_repository(
    body: IngestRequest, session: Session = Depends(get_session)
) -> RepositoryOut:
    try:
        repository, _ = _ingest_service(session).ingest(body.url)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return RepositoryOut.of(repository)


@router.get("", response_model=list[RepositoryOut])
def list_repositories(session: Session = Depends(get_session)) -> list[RepositoryOut]:
    return [RepositoryOut.of(r) for r in SqlRepositoryRepository(session).list()]


@router.get("/{repository_id}", response_model=RepositoryOut)
def get_repository(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> RepositoryOut:
    repository = SqlRepositoryRepository(session).get(repository_id)
    if repository is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repository not found")
    return RepositoryOut.of(repository)
