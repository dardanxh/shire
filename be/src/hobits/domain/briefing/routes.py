"""FastAPI routes for the Briefing domain."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.domain.briefing.schemas import BriefingItemResult
from hobits.domain.briefing.services import BriefingService

router = APIRouter(prefix="/briefing", tags=["briefing"])


class MarkReadRequest(BaseModel):
    """Mark all posts read — scoped to one hobit when `hobit_slug` is set, else the whole feed."""

    hobit_slug: str | None = None


@router.get("", response_model=list[BriefingItemResult])
def get_briefing(
    hobit_slug: str | None = None, session: Session = Depends(get_session)
) -> list[BriefingItemResult]:
    """The briefing feed — every hobit post, newest first. Optionally filtered to one hobit."""
    return BriefingService(session).get_briefing(hobit_slug)


@router.post("/{item_id}/read", status_code=204)
def mark_post_read(item_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    """Mark a single post read."""
    BriefingService(session).mark_read(item_id)


@router.post("/read", status_code=204)
def mark_read(body: MarkReadRequest, session: Session = Depends(get_session)) -> None:
    """Mark all posts read (or all of one hobit's posts when `hobit_slug` is given)."""
    BriefingService(session).mark_read_for_hobit(body.hobit_slug)
