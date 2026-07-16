"""Data access for news topics, sources, items, polls, recommendations and config."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from shire.domain.news.models import (
    NewsConfigRow,
    NewsItemRow,
    NewsPollRow,
    NewsRecommendationRow,
    NewsSourceRow,
    NewsTopicRow,
)


class SqlNewsTopicRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: NewsTopicRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, topic_id: uuid.UUID) -> NewsTopicRow | None:
        return self._session.get(NewsTopicRow, topic_id)

    def list(self, *, enabled_only: bool = False) -> list[NewsTopicRow]:
        stmt = select(NewsTopicRow).order_by(NewsTopicRow.created_at.desc())
        if enabled_only:
            stmt = stmt.where(NewsTopicRow.enabled.is_(True))
        return list(self._session.scalars(stmt))

    def names(self) -> set[str]:
        return set(self._session.scalars(select(NewsTopicRow.name)))

    def delete(self, topic_id: uuid.UUID) -> None:
        row = self.get(topic_id)
        if row is not None:
            self._session.delete(row)
            self._session.flush()


class SqlNewsSourceRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: NewsSourceRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, source_id: uuid.UUID) -> NewsSourceRow | None:
        return self._session.get(NewsSourceRow, source_id)

    def list_for_topic(self, topic_id: uuid.UUID) -> list[NewsSourceRow]:
        stmt = (
            select(NewsSourceRow)
            .where(NewsSourceRow.topic_id == topic_id)
            .order_by(NewsSourceRow.created_at.asc())
        )
        return list(self._session.scalars(stmt))

    def by_topics(self, topic_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[NewsSourceRow]]:
        stmt = (
            select(NewsSourceRow)
            .where(NewsSourceRow.topic_id.in_(topic_ids))
            .order_by(NewsSourceRow.created_at.asc())
        )
        grouped: dict[uuid.UUID, list[NewsSourceRow]] = {}
        for row in self._session.scalars(stmt):
            grouped.setdefault(row.topic_id, []).append(row)
        return grouped

    def exists(self, topic_id: uuid.UUID, url: str) -> bool:
        stmt = select(NewsSourceRow.id).where(
            NewsSourceRow.topic_id == topic_id, NewsSourceRow.url == url
        )
        return self._session.scalars(stmt).first() is not None

    def delete(self, source_id: uuid.UUID) -> None:
        row = self.get(source_id)
        if row is not None:
            self._session.delete(row)
            self._session.flush()


class SqlNewsItemRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, item_id: uuid.UUID) -> NewsItemRow | None:
        return self._session.get(NewsItemRow, item_id)

    def page(
        self,
        *,
        topic_id: uuid.UUID | None,
        unread_only: bool,
        offset: int,
        limit: int,
    ) -> tuple[list[NewsItemRow], int]:
        """One feed page, newest first, plus the total for the pagination envelope."""
        conditions = []
        if topic_id is not None:
            conditions.append(NewsItemRow.topic_id == topic_id)
        if unread_only:
            conditions.append(NewsItemRow.read_at.is_(None))
        total = self._session.scalar(
            select(func.count()).select_from(NewsItemRow).where(*conditions)
        )
        stmt = (
            select(NewsItemRow)
            .where(*conditions)
            .order_by(NewsItemRow.created_at.desc(), NewsItemRow.id)
            .offset(offset)
            .limit(limit)
        )
        return list(self._session.scalars(stmt)), int(total or 0)

    def recent_for_topic(self, topic_id: uuid.UUID, limit: int) -> list[NewsItemRow]:
        """The topic's newest items — the poll prompt's soft-dedup seen-list."""
        stmt = (
            select(NewsItemRow)
            .where(NewsItemRow.topic_id == topic_id)
            .order_by(NewsItemRow.created_at.desc())
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def unread_counts(self) -> dict[uuid.UUID, int]:
        stmt = (
            select(NewsItemRow.topic_id, func.count())
            .where(NewsItemRow.read_at.is_(None))
            .group_by(NewsItemRow.topic_id)
        )
        return {topic_id: count for topic_id, count in self._session.execute(stmt)}

    def mark_all_read(self, topic_id: uuid.UUID | None) -> None:
        stmt = (
            update(NewsItemRow)
            .where(NewsItemRow.read_at.is_(None))
            .values(read_at=datetime.now(UTC))
        )
        if topic_id is not None:
            stmt = stmt.where(NewsItemRow.topic_id == topic_id)
        self._session.execute(stmt)


class SqlNewsPollRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: NewsPollRow) -> None:
        self._session.add(row)
        self._session.flush()

    def list_recent(self, *, topic_id: uuid.UUID | None, limit: int = 50) -> list[NewsPollRow]:
        stmt = select(NewsPollRow).order_by(NewsPollRow.created_at.desc()).limit(limit)
        if topic_id is not None:
            stmt = stmt.where(NewsPollRow.topic_id == topic_id)
        return list(self._session.scalars(stmt))

    def latest_per_topic(self) -> dict[uuid.UUID, NewsPollRow]:
        """The newest poll per topic — its current fetch state."""
        stmt = select(NewsPollRow).order_by(NewsPollRow.created_at.asc())
        latest: dict[uuid.UUID, NewsPollRow] = {}
        for row in self._session.scalars(stmt):
            latest[row.topic_id] = row  # ascending order → last write wins
        return latest

    def has_pending(self, topic_id: uuid.UUID) -> bool:
        stmt = select(NewsPollRow.id).where(
            NewsPollRow.topic_id == topic_id, NewsPollRow.status == "pending"
        )
        return self._session.scalars(stmt).first() is not None


class SqlNewsRecommendationRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: NewsRecommendationRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, recommendation_id: uuid.UUID) -> NewsRecommendationRow | None:
        return self._session.get(NewsRecommendationRow, recommendation_id)

    def list(self, *, status: str | None = None) -> list[NewsRecommendationRow]:
        stmt = select(NewsRecommendationRow).order_by(NewsRecommendationRow.created_at.desc())
        if status is not None:
            stmt = stmt.where(NewsRecommendationRow.status == status)
        return list(self._session.scalars(stmt))

    def names_with_status(self, status: str) -> list[str]:
        stmt = select(NewsRecommendationRow.name).where(NewsRecommendationRow.status == status)
        return list(self._session.scalars(stmt))


class SqlNewsConfigRepository:
    """The singleton news-config row, seeded lazily with defaults."""

    _ROW_ID = 1

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_or_create(self) -> NewsConfigRow:
        row = self._session.get(NewsConfigRow, self._ROW_ID)
        if row is None:
            row = NewsConfigRow(
                id=self._ROW_ID,
                cadence="daily",
                max_items_per_topic=10,
                updated_at=datetime.now(UTC),
            )
            self._session.add(row)
            self._session.flush()
        return row
