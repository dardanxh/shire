"""FastAPI routes for the prompts domain. HTTP concerns only -- logic lives in the service.

Route order matters: `/prompts/analyze` must be declared before `/prompts/{prompt_id}` or the
static segment is swallowed by the UUID path param.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.prompts.analysis import StaticAnalysis
from shire.domain.prompts.schemas import (
    AnalyzePrompt,
    ArenaBatchResult,
    CreatePrompt,
    CreatePromptVersion,
    EnqueuedResult,
    PromptDetailResult,
    PromptMetricsResult,
    PromptResult,
    PromptReviewResult,
    PromptRunResult,
    PromptSuggestionResult,
    PromptVersionDetailResult,
    PromptVersionResult,
    RequestSuggestion,
    StartArenaRun,
    UpdatePrompt,
)
from shire.domain.prompts.services import PromptService

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.post("/analyze", response_model=StaticAnalysis)
def analyze_prompt(body: AnalyzePrompt, session: Session = Depends(get_session)) -> StaticAnalysis:
    """Score a prompt against the best-practice rule pack. Stores nothing, calls no model."""
    return PromptService(session).analyze(body.body)


@router.post("", response_model=PromptDetailResult, status_code=status.HTTP_201_CREATED)
def create_prompt(
    body: CreatePrompt, session: Session = Depends(get_session)
) -> PromptDetailResult:
    """Add a prompt to the library. The supplied body becomes version 1."""
    return PromptService(session).create(body)


@router.get("", response_model=Page[PromptResult])
def list_prompts(
    params: PaginationParams = Depends(), session: Session = Depends(get_session)
) -> Page[PromptResult]:
    """The library, most recently touched first."""
    return PromptService(session).list(params)


@router.get("/{prompt_id}/metrics", response_model=PromptMetricsResult)
def get_prompt_metrics(
    prompt_id: uuid.UUID, session: Session = Depends(get_session)
) -> PromptMetricsResult:
    """One point per version for the trend chart: static score, AI scores, measured cost."""
    return PromptService(session).metrics(prompt_id)


@router.get("/{prompt_id}", response_model=PromptDetailResult)
def get_prompt(
    prompt_id: uuid.UUID, session: Session = Depends(get_session)
) -> PromptDetailResult:
    """One prompt with its current version in full and the version list."""
    return PromptService(session).get(prompt_id)


@router.put("/{prompt_id}", response_model=PromptDetailResult)
def update_prompt(
    prompt_id: uuid.UUID, body: UpdatePrompt, session: Session = Depends(get_session)
) -> PromptDetailResult:
    """Library metadata only -- the text is immutable, so edits go through a new version."""
    return PromptService(session).update(prompt_id, body)


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prompt(prompt_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    PromptService(session).delete(prompt_id)


@router.post(
    "/{prompt_id}/versions",
    response_model=PromptVersionDetailResult,
    status_code=status.HTTP_201_CREATED,
)
def create_prompt_version(
    prompt_id: uuid.UUID, body: CreatePromptVersion, session: Session = Depends(get_session)
) -> PromptVersionDetailResult:
    """Append a version and make it current. Scored on the way in."""
    return PromptService(session).create_version(prompt_id, body)


@router.get("/{prompt_id}/versions", response_model=list[PromptVersionResult])
def list_prompt_versions(
    prompt_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[PromptVersionResult]:
    """Every version, newest first."""
    return PromptService(session).list_versions(prompt_id)


@router.get("/{prompt_id}/versions/{version_id}", response_model=PromptVersionDetailResult)
def get_prompt_version(
    prompt_id: uuid.UUID, version_id: uuid.UUID, session: Session = Depends(get_session)
) -> PromptVersionDetailResult:
    return PromptService(session).get_version(prompt_id, version_id)


@router.post("/{prompt_id}/versions/{version_id}/current", response_model=PromptDetailResult)
def set_current_prompt_version(
    prompt_id: uuid.UUID, version_id: uuid.UUID, session: Session = Depends(get_session)
) -> PromptDetailResult:
    """Roll the workbench back to an earlier version without losing later ones."""
    return PromptService(session).set_current_version(prompt_id, version_id)


@router.post(
    "/{prompt_id}/versions/{version_id}/review",
    response_model=EnqueuedResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def review_prompt_version(
    prompt_id: uuid.UUID, version_id: uuid.UUID, session: Session = Depends(get_session)
) -> EnqueuedResult:
    """Score a version on eight dimensions. Poll the version detail for the settled review."""
    return PromptService(session).request_review(prompt_id, version_id)


@router.get(
    "/{prompt_id}/versions/{version_id}/reviews",
    response_model=list[PromptReviewResult],
)
def list_prompt_reviews(
    prompt_id: uuid.UUID, version_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[PromptReviewResult]:
    """AI reviews of this version, newest first."""
    return PromptService(session).list_reviews(prompt_id, version_id)


@router.post(
    "/{prompt_id}/versions/{version_id}/suggest",
    response_model=EnqueuedResult,
    status_code=status.HTTP_202_ACCEPTED,
)
def suggest_prompt_rewrite(
    prompt_id: uuid.UUID,
    version_id: uuid.UUID,
    body: RequestSuggestion,
    session: Session = Depends(get_session),
) -> EnqueuedResult:
    """Ask the model for a rewrite. Poll the version detail for the settled suggestion."""
    return PromptService(session).request_suggestion(prompt_id, version_id, body)


@router.get(
    "/{prompt_id}/versions/{version_id}/suggestions",
    response_model=list[PromptSuggestionResult],
)
def list_prompt_suggestions(
    prompt_id: uuid.UUID, version_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[PromptSuggestionResult]:
    """Rewrites proposed for this version, newest first."""
    return PromptService(session).list_suggestions(prompt_id, version_id)


@router.post(
    "/{prompt_id}/versions/{version_id}/runs",
    response_model=list[PromptRunResult],
    status_code=status.HTTP_202_ACCEPTED,
)
def start_prompt_arena_run(
    prompt_id: uuid.UUID,
    version_id: uuid.UUID,
    body: StartArenaRun,
    session: Session = Depends(get_session),
) -> list[PromptRunResult]:
    """Run this version against several models at once. One engine job per model."""
    return PromptService(session).start_arena_run(prompt_id, version_id, body)


@router.get(
    "/{prompt_id}/versions/{version_id}/batches",
    response_model=list[ArenaBatchResult],
)
def list_prompt_arena_batches(
    prompt_id: uuid.UUID, version_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[ArenaBatchResult]:
    """Arena batches for this version, newest first, each with the judge's verdict."""
    return PromptService(session).list_batches(prompt_id, version_id)
