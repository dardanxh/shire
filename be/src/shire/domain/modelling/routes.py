"""FastAPI routes for the data-modelling strategy catalog."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from fastapi_pagination import Page, Params
from sqlalchemy.orm import Session

from shire.core.db import get_session
from shire.domain.modelling.schemas import (
    Complexity,
    CreateModellingStrategy,
    Family,
    ModellingStrategyResult,
    Topic,
    UpdateModellingStrategy,
)
from shire.domain.modelling.services import ModellingStrategyService

router = APIRouter(prefix="/modelling-strategies", tags=["modelling-strategies"])


@router.get("", response_model=Page[ModellingStrategyResult])
def list_modelling_strategies(
    params: Params = Depends(),
    topic: Topic | None = None,
    family: Family | None = None,
    complexity: Complexity | None = None,
    q: str | None = None,
    session: Session = Depends(get_session),
) -> Page[ModellingStrategyResult]:
    """Paginated catalog, ordered by family, position, name."""
    return ModellingStrategyService(session).list_strategies(
        params, topic=topic, family=family, complexity=complexity, q=q
    )


@router.post(
    "", response_model=ModellingStrategyResult, status_code=status.HTTP_201_CREATED
)
def create_modelling_strategy(
    body: CreateModellingStrategy, session: Session = Depends(get_session)
) -> ModellingStrategyResult:
    return ModellingStrategyService(session).create_strategies([body])[0]


@router.get("/{strategy_id}", response_model=ModellingStrategyResult)
def get_modelling_strategy(
    strategy_id: uuid.UUID, session: Session = Depends(get_session)
) -> ModellingStrategyResult:
    return ModellingStrategyService(session).get_strategies([strategy_id])[0]


@router.patch("/{strategy_id}", response_model=ModellingStrategyResult)
def update_modelling_strategy(
    strategy_id: uuid.UUID,
    body: UpdateModellingStrategy,
    session: Session = Depends(get_session),
) -> ModellingStrategyResult:
    return ModellingStrategyService(session).update_strategies([(strategy_id, body)])[0]


@router.delete("/{strategy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_modelling_strategy(
    strategy_id: uuid.UUID, session: Session = Depends(get_session)
) -> None:
    ModellingStrategyService(session).delete_strategies([strategy_id])
