"""FastAPI routes for the security & data privacy catalogs (content read-only; star-only PATCH)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.security.schemas import (
    Complexity,
    DataRegulationResult,
    DataSafetyPracticeResult,
    PracticeCategory,
    Region,
    RegulationCategory,
    UpdateDataRegulation,
    UpdateDataSafetyPractice,
)
from shire.domain.security.services import DataRegulationService, DataSafetyPracticeService

regulations_router = APIRouter(prefix="/data-regulations", tags=["data-regulations"])
practices_router = APIRouter(prefix="/data-safety-practices", tags=["data-safety-practices"])


@regulations_router.get("", response_model=Page[DataRegulationResult])
def list_data_regulations(
    params: Params = Depends(),
    category: RegulationCategory | None = None,
    region: Region | None = None,
    q: str | None = None,
    starred: bool | None = None,
    session: Session = Depends(get_session),
) -> Page[DataRegulationResult]:
    """Paginated regulation catalog, ordered by position, name."""
    return DataRegulationService(session).list_regulations(
        params, category=category, region=region, q=q, starred=starred
    )


@regulations_router.get("/{regulation_id}", response_model=DataRegulationResult)
def get_data_regulation(
    regulation_id: uuid.UUID, session: Session = Depends(get_session)
) -> DataRegulationResult:
    return DataRegulationService(session).get_regulations([regulation_id])[0]


@regulations_router.patch("/{regulation_id}", response_model=DataRegulationResult)
def update_data_regulation(
    regulation_id: uuid.UUID,
    body: UpdateDataRegulation,
    session: Session = Depends(get_session),
) -> DataRegulationResult:
    """Star-only curation — regulation content stays seed-managed."""
    return DataRegulationService(session).update_regulations([(regulation_id, body)])[0]


@practices_router.get("", response_model=Page[DataSafetyPracticeResult])
def list_data_safety_practices(
    params: Params = Depends(),
    category: PracticeCategory | None = None,
    complexity: Complexity | None = None,
    q: str | None = None,
    starred: bool | None = None,
    session: Session = Depends(get_session),
) -> Page[DataSafetyPracticeResult]:
    """Paginated practice catalog, ordered by category, position, name."""
    return DataSafetyPracticeService(session).list_practices(
        params, category=category, complexity=complexity, q=q, starred=starred
    )


@practices_router.get("/{practice_id}", response_model=DataSafetyPracticeResult)
def get_data_safety_practice(
    practice_id: uuid.UUID, session: Session = Depends(get_session)
) -> DataSafetyPracticeResult:
    return DataSafetyPracticeService(session).get_practices([practice_id])[0]


@practices_router.patch("/{practice_id}", response_model=DataSafetyPracticeResult)
def update_data_safety_practice(
    practice_id: uuid.UUID,
    body: UpdateDataSafetyPractice,
    session: Session = Depends(get_session),
) -> DataSafetyPracticeResult:
    """Star-only curation — practice content stays seed-managed."""
    return DataSafetyPracticeService(session).update_practices([(practice_id, body)])[0]
