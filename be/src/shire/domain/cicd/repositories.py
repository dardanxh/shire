"""Data access for the CI/CD analysis, its suggestions, and its executions."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.domain.cicd.models import (
    CicdAnalysisRow,
    CicdExecutionRow,
    CicdSuggestionRow,
)


class SqlCicdRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # --- analysis (one current row per repository) -----------------------------
    def get_analysis(self, repository_id: uuid.UUID) -> CicdAnalysisRow | None:
        return self._session.scalar(
            select(CicdAnalysisRow).where(CicdAnalysisRow.repository_id == repository_id)
        )

    def replace_analysis(self, repository_id: uuid.UUID, **fields) -> CicdAnalysisRow:
        """Upsert the repository's single analysis row — a scan always replaces it whole."""
        row = self.get_analysis(repository_id)
        if row is None:
            row = CicdAnalysisRow(repository_id=repository_id)
            self._session.add(row)
        for key, value in fields.items():
            setattr(row, key, value)
        self._session.flush()
        return row

    # --- suggestions -----------------------------------------------------------
    def list_suggestions(self, repository_id: uuid.UUID) -> list[CicdSuggestionRow]:
        return list(
            self._session.scalars(
                select(CicdSuggestionRow)
                .where(CicdSuggestionRow.repository_id == repository_id)
                .order_by(CicdSuggestionRow.created_at.desc())
            )
        )

    def clear_proposed(self, repository_id: uuid.UUID, source: str) -> None:
        """A fresh run from one engine replaces only its own proposals; `applied` rows and the
        other engine's proposals stay."""
        for row in self._session.scalars(
            select(CicdSuggestionRow).where(
                CicdSuggestionRow.repository_id == repository_id,
                CicdSuggestionRow.source == source,
                CicdSuggestionRow.status == "proposed",
            )
        ):
            self._session.delete(row)

    def add_suggestions(
        self, repository_id: uuid.UUID, source: str, items: list[dict]
    ) -> int:
        for item in items:
            self._session.add(
                CicdSuggestionRow(repository_id=repository_id, source=source, **item)
            )
        self._session.flush()
        return len(items)

    def proposed_by_ids(
        self, repository_id: uuid.UUID, ids: list[uuid.UUID]
    ) -> list[CicdSuggestionRow]:
        return list(
            self._session.scalars(
                select(CicdSuggestionRow).where(
                    CicdSuggestionRow.id.in_(ids),
                    CicdSuggestionRow.repository_id == repository_id,
                    CicdSuggestionRow.status == "proposed",
                )
            )
        )

    # --- executions ------------------------------------------------------------
    def list_executions(self, repository_id: uuid.UUID) -> list[CicdExecutionRow]:
        return list(
            self._session.scalars(
                select(CicdExecutionRow)
                .where(CicdExecutionRow.repository_id == repository_id)
                .order_by(CicdExecutionRow.created_at.desc())
            )
        )

    def pending_execution(self, repository_id: uuid.UUID) -> CicdExecutionRow | None:
        return self._session.scalar(
            select(CicdExecutionRow).where(
                CicdExecutionRow.repository_id == repository_id,
                CicdExecutionRow.status == "pending",
            )
        )

    def add_execution(self, row: CicdExecutionRow) -> CicdExecutionRow:
        self._session.add(row)
        self._session.flush()
        return row
