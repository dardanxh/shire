"""Data access for council topics and takes."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from shire.domain.council.models import CouncilTakeRow, CouncilTopicRow


class SqlCouncilTopicRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: CouncilTopicRow) -> None:
        self._session.add(row)
        self._session.flush()  # row.id available to the caller

    def get(self, topic_id: uuid.UUID) -> CouncilTopicRow | None:
        return self._session.get(CouncilTopicRow, topic_id)

    def count(self) -> int:
        return self._session.scalar(select(func.count()).select_from(CouncilTopicRow)) or 0

    def list(self, *, limit: int, offset: int) -> list[CouncilTopicRow]:
        stmt = (
            select(CouncilTopicRow)
            .order_by(CouncilTopicRow.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt))

    def delete(self, topic_id: uuid.UUID) -> None:
        self._session.execute(delete(CouncilTopicRow).where(CouncilTopicRow.id == topic_id))


class SqlCouncilTakeRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: CouncilTakeRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, take_id: uuid.UUID) -> CouncilTakeRow | None:
        return self._session.get(CouncilTakeRow, take_id)

    def list_for_topic(self, topic_id: uuid.UUID) -> list[CouncilTakeRow]:
        stmt = (
            select(CouncilTakeRow)
            .where(CouncilTakeRow.topic_id == topic_id)
            .order_by(CouncilTakeRow.round, CouncilTakeRow.started_at)
        )
        return list(self._session.scalars(stmt))

    def list_for_round(self, topic_id: uuid.UUID, round_no: int) -> list[CouncilTakeRow]:
        stmt = (
            select(CouncilTakeRow)
            .where(CouncilTakeRow.topic_id == topic_id, CouncilTakeRow.round == round_no)
            .order_by(CouncilTakeRow.started_at)
        )
        return list(self._session.scalars(stmt))

    def delete_for_topic(self, topic_id: uuid.UUID) -> None:
        self._session.execute(
            delete(CouncilTakeRow).where(CouncilTakeRow.topic_id == topic_id)
        )
