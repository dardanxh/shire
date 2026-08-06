"""FastAPI routes for the Highlights domain. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.core.pagination import Page, PaginationParams
from shire.domain.highlights.schemas import CreateHighlight, HighlightResult
from shire.domain.highlights.services import HighlightService

router = APIRouter(prefix="/highlights", tags=["highlights"])


@router.post("", response_model=HighlightResult, status_code=status.HTTP_201_CREATED)
def create_highlight(
    body: CreateHighlight, session: Session = Depends(get_session)
) -> HighlightResult:
    """Keep a passage the user selected while reading."""
    return HighlightService(session).create(body)


@router.get("", response_model=Page[HighlightResult])
def list_highlights(
    params: PaginationParams = Depends(), session: Session = Depends(get_session)
) -> Page[HighlightResult]:
    """Kept passages, newest first."""
    return HighlightService(session).list(params)


@router.delete("/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_highlight(highlight_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    HighlightService(session).delete(highlight_id)
