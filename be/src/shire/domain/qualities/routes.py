"""FastAPI routes for the architecture-qualities catalog (content read-only; star-only PATCH)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.qualities.schemas import (
    ArchitectureQualityResult,
    QualityCategory,
    UpdateArchitectureQuality,
)
from shire.domain.qualities.services import ArchitectureQualityService

router = APIRouter(prefix="/architecture-qualities", tags=["architecture-qualities"])


@router.get("", response_model=Page[ArchitectureQualityResult])
def list_architecture_qualities(
    params: Params = Depends(),
    category: QualityCategory | None = None,
    q: str | None = None,
    starred: bool | None = None,
    session: Session = Depends(get_session),
) -> Page[ArchitectureQualityResult]:
    """Paginated qualities catalog, ordered by category, position, name."""
    return ArchitectureQualityService(session).list_qualities(
        params, category=category, q=q, starred=starred
    )


@router.get("/{quality_id}", response_model=ArchitectureQualityResult)
def get_architecture_quality(
    quality_id: uuid.UUID, session: Session = Depends(get_session)
) -> ArchitectureQualityResult:
    return ArchitectureQualityService(session).get_qualities([quality_id])[0]


@router.patch("/{quality_id}", response_model=ArchitectureQualityResult)
def update_architecture_quality(
    quality_id: uuid.UUID,
    body: UpdateArchitectureQuality,
    session: Session = Depends(get_session),
) -> ArchitectureQualityResult:
    """Star-only curation — quality content stays seed-managed."""
    return ArchitectureQualityService(session).update_qualities([(quality_id, body)])[0]
