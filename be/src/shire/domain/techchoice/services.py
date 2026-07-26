"""Tech decision service — save/list/delete named chooser runs."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError
from shire.domain.techchoice.models import TechDecisionRow
from shire.domain.techchoice.schemas import CreateTechDecision, TechDecisionResult


class TechDecisionService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_decisions(self) -> list[TechDecisionResult]:
        rows = self._session.scalars(
            select(TechDecisionRow).order_by(TechDecisionRow.created_at.desc())
        )
        return [TechDecisionResult.model_validate(row) for row in rows]

    def create_decision(self, body: CreateTechDecision) -> TechDecisionResult:
        row = TechDecisionRow(name=body.name, inputs=body.inputs)
        self._session.add(row)
        self._session.flush()
        return TechDecisionResult.model_validate(row)

    def delete_decision(self, decision_id: uuid.UUID) -> None:
        row = self._session.get(TechDecisionRow, decision_id)
        if row is None:
            raise NotFoundError(f"Decision not found: {decision_id}")
        self._session.delete(row)
        self._session.flush()
