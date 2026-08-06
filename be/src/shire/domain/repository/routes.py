"""FastAPI routes for the Repository domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.repository.schemas import (
    AskQuestionRequest,
    BranchesResult,
    BranchNamesResult,
    IngestRepositoryRequest,
    QuestionResult,
    RepositoryResult,
    StarRequest,
    SwitchBranchRequest,
)
from shire.domain.repository.services import RepositoryService, run_ingest_pipeline

router = APIRouter(prefix="/repositories", tags=["repositories"])


@router.post("", response_model=RepositoryResult, status_code=status.HTTP_201_CREATED)
def ingest_repository(
    body: IngestRepositoryRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> RepositoryResult:
    """Register a repository and start the clone→analyze pipeline in the background
    (non-blocking — the row is returned immediately; poll its `status`)."""
    result = RepositoryService(session).ingest(body.url, body.connection_id, body.subpath)
    background_tasks.add_task(run_ingest_pipeline, result.id, tool_ids=body.tool_ids)
    return result


@router.get("", response_model=Page[RepositoryResult])
def list_repositories(
    params: PaginationParams = Depends(),
    session: Session = Depends(get_session),
) -> Page[RepositoryResult]:
    return RepositoryService(session).list(params)


@router.get("/starred", response_model=list[RepositoryResult])
def list_starred_repositories(
    session: Session = Depends(get_session),
) -> list[RepositoryResult]:
    """Every starred repository, newest-onboarded first (unpaginated — it's a hand-curated
    set). Declared before `/{repository_id}` so the literal path wins the match."""
    return RepositoryService(session).list_starred()


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
    repository_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> RepositoryResult:
    """Pull the latest from the remote and re-run the full analysis in the background
    (non-blocking — poll the repository's `status`)."""
    result = RepositoryService(session).refresh(repository_id)
    background_tasks.add_task(run_ingest_pipeline, result.id, pull=True)
    return result


@router.put("/{repository_id}/star", response_model=RepositoryResult)
def set_repository_starred(
    repository_id: uuid.UUID,
    body: StarRequest,
    session: Session = Depends(get_session),
) -> RepositoryResult:
    """Star or unstar a repository (a bookmark for the list's Starred tab)."""
    return RepositoryService(session).set_starred(repository_id, body.starred)


@router.post(
    "/{repository_id}/questions",
    response_model=QuestionResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def ask_repository_question(
    repository_id: uuid.UUID,
    body: AskQuestionRequest,
    session: Session = Depends(get_session),
) -> QuestionResult:
    """Ask a free-form question about the repository — answered by an engine job that explores
    the clone (non-blocking; poll the questions list)."""
    return RepositoryService(session).ask_question(repository_id, body.question)


@router.get("/{repository_id}/questions", response_model=list[QuestionResult])
def list_repository_questions(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[QuestionResult]:
    """Asked questions with their answers, newest first (the Ask tab's poll target)."""
    return RepositoryService(session).list_questions(repository_id)


@router.post("/{repository_id}/branch", response_model=RepositoryResult)
def switch_repository_branch(
    repository_id: uuid.UUID,
    body: SwitchBranchRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> RepositoryResult:
    """Check out a branch, clear generated artifacts, and re-run the full analysis in the
    background (non-blocking — poll the repository's `status`)."""
    result = RepositoryService(session).switch_branch(repository_id, body.branch)
    # Same-branch switches return early with the repo still `ready` — nothing to re-run.
    if result.status == "cloning":
        background_tasks.add_task(run_ingest_pipeline, result.id, branch=body.branch)
    return result


@router.delete("/{repository_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_repository(repository_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    """Delete a repository and everything derived from it (analysis, artifacts, hobit runs,
    briefing items, and the clone). A local repo's own files are left untouched."""
    RepositoryService(session).delete(repository_id)
