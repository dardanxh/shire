"""FastAPI routes for the technology corpus. HTTP concerns only — logic lives in the service."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.technology.schemas import (
    CreateTechCategory,
    CreateTechnology,
    TechCategoryResult,
    TechCategoryTreeResult,
    TechnologyBlueprintRef,
    TechnologyResult,
    UpdateTechCategory,
    UpdateTechnology,
)
from shire.domain.technology.services import TechnologyService

categories_router = APIRouter(prefix="/technology-categories", tags=["technology"])
technologies_router = APIRouter(prefix="/technologies", tags=["technology"])


@categories_router.get("", response_model=list[TechCategoryTreeResult])
def category_tree(session: Session = Depends(get_session)) -> list[TechCategoryTreeResult]:
    """The two-level category tree (groups with nested categories + technology counts)."""
    return TechnologyService(session).category_tree()


@categories_router.post(
    "", response_model=TechCategoryResult, status_code=status.HTTP_201_CREATED
)
def create_category(
    body: CreateTechCategory, session: Session = Depends(get_session)
) -> TechCategoryResult:
    return TechnologyService(session).create_categories([body])[0]


@categories_router.patch("/{category_id}", response_model=TechCategoryResult)
def update_category(
    category_id: uuid.UUID, body: UpdateTechCategory, session: Session = Depends(get_session)
) -> TechCategoryResult:
    return TechnologyService(session).update_categories([(category_id, body)])[0]


@categories_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    TechnologyService(session).delete_categories([category_id])


@technologies_router.get("", response_model=Page[TechnologyResult])
def list_technologies(
    params: Params = Depends(),
    category: str | None = None,
    q: str | None = None,
    maturity: str | None = None,
    deployment: str | None = None,
    oss: bool | None = None,
    starred: bool | None = None,
    time_to_win: str | None = None,
    cost_model: str | None = None,
    cost_tier: str | None = None,
    session: Session = Depends(get_session),
) -> Page[TechnologyResult]:
    """Paginated corpus search. `category` is a slug (a group slug includes its categories)."""
    return TechnologyService(session).list_technologies(
        params,
        category=category,
        q=q,
        maturity=maturity,
        deployment=deployment,
        oss=oss,
        starred=starred,
        time_to_win=time_to_win,
        cost_model=cost_model,
        cost_tier=cost_tier,
    )


@technologies_router.get(
    "/{technology_id}/blueprints", response_model=list[TechnologyBlueprintRef]
)
def list_technology_blueprints(
    technology_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[TechnologyBlueprintRef]:
    """Architecture blueprints whose stages recommend or list this technology."""
    return TechnologyService(session).get_technology_blueprints(technology_id)


@technologies_router.post("", response_model=TechnologyResult, status_code=status.HTTP_201_CREATED)
def create_technology(
    body: CreateTechnology, session: Session = Depends(get_session)
) -> TechnologyResult:
    return TechnologyService(session).create_technologies([body])[0]


@technologies_router.get("/{technology_id}", response_model=TechnologyResult)
def get_technology(
    technology_id: uuid.UUID, session: Session = Depends(get_session)
) -> TechnologyResult:
    return TechnologyService(session).get_technologies([technology_id])[0]


@technologies_router.patch("/{technology_id}", response_model=TechnologyResult)
def update_technology(
    technology_id: uuid.UUID, body: UpdateTechnology, session: Session = Depends(get_session)
) -> TechnologyResult:
    return TechnologyService(session).update_technologies([(technology_id, body)])[0]


@technologies_router.delete("/{technology_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_technology(technology_id: uuid.UUID, session: Session = Depends(get_session)) -> None:
    TechnologyService(session).delete_technologies([technology_id])
