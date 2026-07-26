"""FastAPI routes for saved Tech Chooser decisions."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.techchoice.schemas import CreateTechDecision, TechDecisionResult
from shire.domain.techchoice.services import TechDecisionService

router = APIRouter(prefix="/tech-decisions", tags=["techchoice"])


@router.get("", response_model=list[TechDecisionResult])
def list_decisions(session: Session = Depends(get_session)) -> list[TechDecisionResult]:
    """Saved decisions, newest first (small list — unpaginated)."""
    return TechDecisionService(session).list_decisions()


@router.post("", response_model=TechDecisionResult, status_code=status.HTTP_201_CREATED)
def create_decision(
    body: CreateTechDecision, session: Session = Depends(get_session)
) -> TechDecisionResult:
    return TechDecisionService(session).create_decision(body)


@router.delete("/{decision_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_decision(
    decision_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    TechDecisionService(session).delete_decision(decision_id)
