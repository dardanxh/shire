"""FastAPI routes for the Context domain — the context pack plus editable Markdown."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.domain.context.schemas import (
    ContextMarkdownResult,
    ContextMarkdownUpdate,
    RepoContextResult,
)
from hobits.domain.context.services import ContextService

router = APIRouter(tags=["context"])


@router.get("/repositories/{repository_id}/context", response_model=RepoContextResult)
def repository_context(
    repository_id: uuid.UUID,
    format: Literal["json", "markdown"] = "json",
    refresh: bool = False,
    session: Session = Depends(get_session),
):
    """The whole precomputed context pack for a repository in one call.

    `format=markdown` returns the effective Markdown (the user's override when present, else the
    generated rendering); `refresh=true` forces a rebuild instead of serving the cached pack.
    """
    service = ContextService(session)
    if format == "markdown":
        return PlainTextResponse(service.get_markdown(repository_id).effective)
    return service.get_context(repository_id, refresh=refresh)


@router.get(
    "/repositories/{repository_id}/context/markdown", response_model=ContextMarkdownResult
)
def context_markdown(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> ContextMarkdownResult:
    """The context as Markdown: the generated rendering plus any saved user override."""
    return ContextService(session).get_markdown(repository_id)


@router.put(
    "/repositories/{repository_id}/context/markdown", response_model=ContextMarkdownResult
)
def save_context_markdown(
    repository_id: uuid.UUID,
    body: ContextMarkdownUpdate,
    session: Session = Depends(get_session),
) -> ContextMarkdownResult:
    """Save a user-authored Markdown override (persists across regeneration)."""
    return ContextService(session).save_markdown(repository_id, body.markdown)


@router.delete(
    "/repositories/{repository_id}/context/markdown", response_model=ContextMarkdownResult
)
def reset_context_markdown(
    repository_id: uuid.UUID, session: Session = Depends(get_session)
) -> ContextMarkdownResult:
    """Drop the override and fall back to the generated Markdown."""
    return ContextService(session).clear_markdown(repository_id)
