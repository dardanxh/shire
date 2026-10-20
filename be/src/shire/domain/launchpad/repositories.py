"""Data access for Launchpad categories, bookmarks, actions and action runs."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Float, cast, func, or_, select, update
from sqlalchemy.orm import Session, undefer

from shire.domain.launchpad.domain import FRECENCY_DECAY_PER_SECOND
from shire.domain.launchpad.models import (
    ActionRunRow,
    BookmarkActionRow,
    BookmarkRow,
    LaunchpadCategoryRow,
)


class SqlLaunchpadCategoryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: LaunchpadCategoryRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, category_id: uuid.UUID) -> LaunchpadCategoryRow | None:
        return self._session.get(LaunchpadCategoryRow, category_id)

    def get_by_name(self, name: str) -> LaunchpadCategoryRow | None:
        return self._session.scalar(
            select(LaunchpadCategoryRow).where(
                func.lower(LaunchpadCategoryRow.name) == name.lower()
            )
        )

    def list(self) -> list[LaunchpadCategoryRow]:
        stmt = select(LaunchpadCategoryRow).order_by(
            LaunchpadCategoryRow.position, LaunchpadCategoryRow.name
        )
        return list(self._session.scalars(stmt))

    def next_position(self) -> int:
        return int(self._session.scalar(select(func.max(LaunchpadCategoryRow.position))) or 0) + 1

    def bookmark_counts(self) -> dict[uuid.UUID, int]:
        stmt = (
            select(BookmarkRow.category_id, func.count(BookmarkRow.id))
            .where(BookmarkRow.category_id.is_not(None))
            .group_by(BookmarkRow.category_id)
        )
        return dict(self._session.execute(stmt).tuples().all())

    def delete(self, row: LaunchpadCategoryRow) -> None:
        self._session.delete(row)
        self._session.flush()


class SqlBookmarkRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: BookmarkRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, bookmark_id: uuid.UUID, *, with_logo: bool = False) -> BookmarkRow | None:
        options = [undefer(BookmarkRow.logo_bytes)] if with_logo else []
        return self._session.get(BookmarkRow, bookmark_id, options=options)

    def list(
        self,
        *,
        now: datetime,
        q: str | None = None,
        category_id: uuid.UUID | None = None,
        starred: bool | None = None,
    ) -> list[BookmarkRow]:
        """Starred first, then by frecency decayed to `now` (computed in SQL), then name."""
        elapsed = func.extract("epoch", now - BookmarkRow.last_visited_at)
        decayed = func.coalesce(
            BookmarkRow.frecency * func.exp(-cast(FRECENCY_DECAY_PER_SECOND, Float) * elapsed),
            0.0,
        )
        stmt = select(BookmarkRow).order_by(
            BookmarkRow.starred.desc(), decayed.desc(), func.lower(BookmarkRow.name)
        )
        if q:
            pattern = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    BookmarkRow.name.ilike(pattern),
                    BookmarkRow.url.ilike(pattern),
                    BookmarkRow.description.ilike(pattern),
                )
            )
        if category_id is not None:
            stmt = stmt.where(BookmarkRow.category_id == category_id)
        if starred is not None:
            stmt = stmt.where(BookmarkRow.starred.is_(starred))
        return list(self._session.scalars(stmt))

    def delete(self, row: BookmarkRow) -> None:
        self._session.delete(row)
        self._session.flush()


class SqlBookmarkActionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: BookmarkActionRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, action_id: uuid.UUID) -> BookmarkActionRow | None:
        return self._session.get(BookmarkActionRow, action_id)

    def for_bookmark(self, bookmark_id: uuid.UUID) -> BookmarkActionRow | None:
        return self._session.scalar(
            select(BookmarkActionRow).where(BookmarkActionRow.bookmark_id == bookmark_id)
        )

    def by_bookmarks(self, bookmark_ids: list[uuid.UUID]) -> dict[uuid.UUID, BookmarkActionRow]:
        if not bookmark_ids:
            return {}
        stmt = select(BookmarkActionRow).where(BookmarkActionRow.bookmark_id.in_(bookmark_ids))
        return {row.bookmark_id: row for row in self._session.scalars(stmt)}

    def claim_due(self, now: datetime, limit: int = 20) -> list[BookmarkActionRow]:
        """Due, enabled actions — row-locked so two backend instances never double-run one."""
        stmt = (
            select(BookmarkActionRow)
            .where(
                BookmarkActionRow.enabled.is_(True),
                BookmarkActionRow.next_run_at.is_not(None),
                BookmarkActionRow.next_run_at <= now,
            )
            .order_by(BookmarkActionRow.next_run_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        return list(self._session.scalars(stmt))

    def delete(self, row: BookmarkActionRow) -> None:
        self._session.delete(row)
        self._session.flush()


class SqlActionRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: ActionRunRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, run_id: uuid.UUID) -> ActionRunRow | None:
        return self._session.get(ActionRunRow, run_id)

    def has_pending(self, action_id: uuid.UUID) -> bool:
        stmt = select(ActionRunRow.id).where(
            ActionRunRow.action_id == action_id, ActionRunRow.status == "pending"
        )
        return self._session.scalar(stmt.limit(1)) is not None

    def list_for_action(
        self, action_id: uuid.UUID, *, limit: int, offset: int
    ) -> tuple[list[ActionRunRow], int]:
        base = select(ActionRunRow).where(ActionRunRow.action_id == action_id)
        total = int(
            self._session.scalar(select(func.count()).select_from(base.subquery())) or 0
        )
        rows = self._session.scalars(
            base.order_by(ActionRunRow.created_at.desc()).limit(limit).offset(offset)
        )
        return list(rows), total

    def latest_by_actions(self, action_ids: list[uuid.UUID]) -> dict[uuid.UUID, ActionRunRow]:
        if not action_ids:
            return {}
        stmt = (
            select(ActionRunRow)
            .where(ActionRunRow.action_id.in_(action_ids))
            .distinct(ActionRunRow.action_id)
            .order_by(ActionRunRow.action_id, ActionRunRow.created_at.desc())
        )
        return {row.action_id: row for row in self._session.scalars(stmt)}

    def unread_counts(self, action_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        if not action_ids:
            return {}
        stmt = (
            select(ActionRunRow.action_id, func.count(ActionRunRow.id))
            .where(
                ActionRunRow.action_id.in_(action_ids),
                ActionRunRow.notify.is_(True),
                ActionRunRow.read_at.is_(None),
            )
            .group_by(ActionRunRow.action_id)
        )
        return dict(self._session.execute(stmt).tuples().all())

    def notifications(
        self, *, unread_only: bool, limit: int
    ) -> list[tuple[ActionRunRow, uuid.UUID, str]]:
        stmt = (
            select(ActionRunRow, BookmarkRow.id, BookmarkRow.name)
            .join(BookmarkActionRow, BookmarkActionRow.id == ActionRunRow.action_id)
            .join(BookmarkRow, BookmarkRow.id == BookmarkActionRow.bookmark_id)
            .where(ActionRunRow.notify.is_(True))
            .order_by(ActionRunRow.created_at.desc())
            .limit(limit)
        )
        if unread_only:
            stmt = stmt.where(ActionRunRow.read_at.is_(None))
        return [(run, bid, name) for run, bid, name in self._session.execute(stmt)]

    def unread_total(self) -> int:
        stmt = select(func.count(ActionRunRow.id)).where(
            ActionRunRow.notify.is_(True), ActionRunRow.read_at.is_(None)
        )
        return int(self._session.scalar(stmt) or 0)

    def mark_read(self, now: datetime, *, run_id: uuid.UUID | None = None) -> None:
        stmt = update(ActionRunRow).where(ActionRunRow.read_at.is_(None)).values(read_at=now)
        if run_id is not None:
            stmt = stmt.where(ActionRunRow.id == run_id)
        self._session.execute(stmt)

    def mark_read_for_action(self, action_id: uuid.UUID, now: datetime) -> None:
        self._session.execute(
            update(ActionRunRow)
            .where(ActionRunRow.action_id == action_id, ActionRunRow.read_at.is_(None))
            .values(read_at=now)
        )
