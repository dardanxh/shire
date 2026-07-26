"""FastAPI routes for saved Capacity Planner calculations."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.capacity.schemas import (
    CapacityCalculationResult,
    CreateCapacityCalculation,
)
from shire.domain.capacity.services import CapacityService

router = APIRouter(prefix="/capacity-calculations", tags=["capacity"])


@router.get("", response_model=list[CapacityCalculationResult])
def list_calculations(
    session: Session = Depends(get_session),
) -> list[CapacityCalculationResult]:
    """Saved calculations, newest first (small list — unpaginated)."""
    return CapacityService(session).list_calculations()


@router.post("", response_model=CapacityCalculationResult, status_code=status.HTTP_201_CREATED)
def create_calculation(
    body: CreateCapacityCalculation, session: Session = Depends(get_session)
) -> CapacityCalculationResult:
    return CapacityService(session).create_calculation(body)


@router.delete("/{calculation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calculation(
    calculation_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    CapacityService(session).delete_calculation(calculation_id)
