"""FastAPI routes for the Briefing domain."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from hobits.core.db import get_session
from hobits.domain.briefing.schemas import TieredBriefingResult
from hobits.domain.briefing.services import BriefingService

router = APIRouter(prefix="/briefing", tags=["briefing"])


@router.get("", response_model=TieredBriefingResult)
def get_briefing(session: Session = Depends(get_session)) -> TieredBriefingResult:
    """All briefing items grouped by tier (NOW / DAILY / WEEKLY), newest first."""
    return BriefingService(session).get_briefing()
