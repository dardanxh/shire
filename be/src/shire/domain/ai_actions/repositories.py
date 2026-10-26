"""Data access for AI Actions. Entities in, entities out."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session, undefer

from shire.domain.ai_actions.models import AiActionRow

# The libpq application_name scripts/host-runner.sh gives every engine connection.
HOST_RUNNER_APPLICATION_NAME = "shire-host-runner"


class SqlAiActionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: AiActionRow) -> None:
        self._session.add(row)
        self._session.flush()  # row.id available to the caller

    def get(self, action_id: uuid.UUID, *, with_report: bool = False) -> AiActionRow | None:
        options = [undefer(AiActionRow.last_report_html)] if with_report else []
        return self._session.get(AiActionRow, action_id, options=options)

    def get_for_update(self, action_id: uuid.UUID) -> AiActionRow | None:
        """Row-locked, so two concurrent "Run now" clicks can't both queue a run."""
        stmt = select(AiActionRow).where(AiActionRow.id == action_id).with_for_update()
        return self._session.scalars(stmt).first()

    def list(self) -> list[AiActionRow]:
        """Every action, alphabetical — a personal set of reports, small enough to show whole."""
        stmt = select(AiActionRow).order_by(AiActionRow.title, AiActionRow.id)
        return list(self._session.scalars(stmt))

    def delete(self, action_id: uuid.UUID) -> None:
        self._session.execute(delete(AiActionRow).where(AiActionRow.id == action_id))

    def claim_due(self, now: datetime, limit: int = 20) -> list[AiActionRow]:
        """Enabled actions whose slot has passed, locked with SKIP LOCKED so a second backend
        instance ticking at the same moment can never start the same run twice."""
        stmt = (
            select(AiActionRow)
            .where(
                AiActionRow.enabled.is_(True),
                AiActionRow.next_run_at.is_not(None),
                AiActionRow.next_run_at <= now,
            )
            .order_by(AiActionRow.next_run_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list(self._session.scalars(stmt))

    def host_runner_connected(self) -> bool:
        """The host runner holds a LISTEN connection open for as long as it lives, so its
        application_name in pg_stat_activity is a reliable liveness signal."""
        found = self._session.execute(
            text("SELECT 1 FROM pg_stat_activity WHERE application_name = :name LIMIT 1"),
            {"name": HOST_RUNNER_APPLICATION_NAME},
        ).first()
        return found is not None
