"""Capacity calculation service — save/list/delete named calculator runs."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError
from shire.domain.capacity.models import CapacityCalculationRow
from shire.domain.capacity.schemas import (
    CapacityCalculationResult,
    CreateCapacityCalculation,
)


class CapacityService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_calculations(self) -> list[CapacityCalculationResult]:
        rows = self._session.scalars(
            select(CapacityCalculationRow).order_by(CapacityCalculationRow.created_at.desc())
        )
        return [CapacityCalculationResult.model_validate(row) for row in rows]

    def create_calculation(
        self, body: CreateCapacityCalculation
    ) -> CapacityCalculationResult:
        row = CapacityCalculationRow(name=body.name, inputs=body.inputs)
        self._session.add(row)
        self._session.flush()
        return CapacityCalculationResult.model_validate(row)

    def delete_calculation(self, calculation_id: uuid.UUID) -> None:
        row = self._session.get(CapacityCalculationRow, calculation_id)
        if row is None:
            raise NotFoundError(f"Calculation not found: {calculation_id}")
        self._session.delete(row)
        self._session.flush()
