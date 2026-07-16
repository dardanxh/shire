"""Data access for roadmaps, versions, milestones, items, dependencies and events."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from shire.domain.roadmap.models import (
    RoadmapConfigRow,
    RoadmapExecutionRow,
    RoadmapItemDependencyRow,
    RoadmapItemEventRow,
    RoadmapItemRow,
    RoadmapMilestoneRow,
    RoadmapRepositoryRow,
    RoadmapRow,
    RoadmapVersionRow,
)


class SqlRoadmapRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: RoadmapRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, roadmap_id: uuid.UUID) -> RoadmapRow | None:
        return self._session.get(RoadmapRow, roadmap_id)

    def page(self, *, offset: int, limit: int) -> tuple[list[RoadmapRow], int]:
        total = self._session.scalar(select(func.count()).select_from(RoadmapRow))
        stmt = (
            select(RoadmapRow)
            .order_by(RoadmapRow.updated_at.desc(), RoadmapRow.id)
            .offset(offset)
            .limit(limit)
        )
        return list(self._session.scalars(stmt)), int(total or 0)

    def delete(self, roadmap_id: uuid.UUID) -> None:
        row = self.get(roadmap_id)
        if row is not None:
            # The roadmaps → current version FK would otherwise block the versions cascade.
            row.current_version_id = None
            self._session.flush()
            self._session.delete(row)
            self._session.flush()

    def repository_ids(self, roadmap_id: uuid.UUID) -> list[uuid.UUID]:
        stmt = (
            select(RoadmapRepositoryRow.repository_id)
            .where(RoadmapRepositoryRow.roadmap_id == roadmap_id)
            .order_by(RoadmapRepositoryRow.position)
        )
        return list(self._session.scalars(stmt))

    def repository_ids_by_roadmap(
        self, roadmap_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[uuid.UUID]]:
        stmt = (
            select(RoadmapRepositoryRow)
            .where(RoadmapRepositoryRow.roadmap_id.in_(roadmap_ids))
            .order_by(RoadmapRepositoryRow.position)
        )
        grouped: dict[uuid.UUID, list[uuid.UUID]] = {}
        for row in self._session.scalars(stmt):
            grouped.setdefault(row.roadmap_id, []).append(row.repository_id)
        return grouped

    def list_for_repository(self, repository_id: uuid.UUID) -> list[RoadmapRow]:
        """Every roadmap whose scope includes the repository, newest activity first."""
        stmt = (
            select(RoadmapRow)
            .join(RoadmapRepositoryRow, RoadmapRepositoryRow.roadmap_id == RoadmapRow.id)
            .where(RoadmapRepositoryRow.repository_id == repository_id)
            .order_by(RoadmapRow.updated_at.desc())
        )
        return list(self._session.scalars(stmt))

    def set_repositories(self, roadmap_id: uuid.UUID, repository_ids: list[uuid.UUID]) -> None:
        existing = {
            row.repository_id: row
            for row in self._session.scalars(
                select(RoadmapRepositoryRow).where(RoadmapRepositoryRow.roadmap_id == roadmap_id)
            )
        }
        for position, repo_id in enumerate(repository_ids):
            row = existing.pop(repo_id, None)
            if row is None:
                self._session.add(
                    RoadmapRepositoryRow(
                        roadmap_id=roadmap_id, repository_id=repo_id, position=position
                    )
                )
            else:
                row.position = position
        for row in existing.values():
            self._session.delete(row)
        self._session.flush()


class SqlRoadmapVersionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: RoadmapVersionRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, version_id: uuid.UUID) -> RoadmapVersionRow | None:
        return self._session.get(RoadmapVersionRow, version_id)

    def list_for_roadmap(self, roadmap_id: uuid.UUID) -> list[RoadmapVersionRow]:
        stmt = (
            select(RoadmapVersionRow)
            .where(RoadmapVersionRow.roadmap_id == roadmap_id)
            .order_by(RoadmapVersionRow.number.desc())
        )
        return list(self._session.scalars(stmt))

    def by_number(self, roadmap_id: uuid.UUID, number: int) -> RoadmapVersionRow | None:
        stmt = select(RoadmapVersionRow).where(
            RoadmapVersionRow.roadmap_id == roadmap_id, RoadmapVersionRow.number == number
        )
        return self._session.scalars(stmt).first()

    def latest(self, roadmap_id: uuid.UUID) -> RoadmapVersionRow | None:
        stmt = (
            select(RoadmapVersionRow)
            .where(RoadmapVersionRow.roadmap_id == roadmap_id)
            .order_by(RoadmapVersionRow.number.desc())
            .limit(1)
        )
        return self._session.scalars(stmt).first()

    def latest_by_roadmap(self, roadmap_ids: list[uuid.UUID]) -> dict[uuid.UUID, RoadmapVersionRow]:
        stmt = (
            select(RoadmapVersionRow)
            .where(RoadmapVersionRow.roadmap_id.in_(roadmap_ids))
            .order_by(RoadmapVersionRow.number.asc())
        )
        latest: dict[uuid.UUID, RoadmapVersionRow] = {}
        for row in self._session.scalars(stmt):
            latest[row.roadmap_id] = row  # ascending order → last write wins
        return latest

    def has_pending(self, roadmap_id: uuid.UUID) -> bool:
        stmt = select(RoadmapVersionRow.id).where(
            RoadmapVersionRow.roadmap_id == roadmap_id,
            RoadmapVersionRow.status == "pending",
        )
        return self._session.scalars(stmt).first() is not None

    def next_number(self, roadmap_id: uuid.UUID) -> int:
        stmt = select(func.max(RoadmapVersionRow.number)).where(
            RoadmapVersionRow.roadmap_id == roadmap_id
        )
        return int(self._session.scalar(stmt) or 0) + 1


class SqlRoadmapItemRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, item_id: uuid.UUID) -> RoadmapItemRow | None:
        return self._session.get(RoadmapItemRow, item_id)

    def list_for_version(self, version_id: uuid.UUID) -> list[RoadmapItemRow]:
        stmt = (
            select(RoadmapItemRow)
            .where(RoadmapItemRow.version_id == version_id)
            .order_by(RoadmapItemRow.position, RoadmapItemRow.created_at)
        )
        return list(self._session.scalars(stmt))

    def milestones_for_version(self, version_id: uuid.UUID) -> list[RoadmapMilestoneRow]:
        stmt = (
            select(RoadmapMilestoneRow)
            .where(RoadmapMilestoneRow.version_id == version_id)
            .order_by(RoadmapMilestoneRow.position)
        )
        return list(self._session.scalars(stmt))

    def get_milestone(self, milestone_id: uuid.UUID) -> RoadmapMilestoneRow | None:
        return self._session.get(RoadmapMilestoneRow, milestone_id)

    def status_counts(self, version_id: uuid.UUID) -> dict[str, int]:
        stmt = (
            select(RoadmapItemRow.status, func.count())
            .where(RoadmapItemRow.version_id == version_id)
            .group_by(RoadmapItemRow.status)
        )
        return dict(self._session.execute(stmt).all())

    def count_for_version(self, version_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(RoadmapItemRow)
            .where(RoadmapItemRow.version_id == version_id)
        )
        return int(self._session.scalar(stmt) or 0)

    def dependencies_for_version(self, version_id: uuid.UUID) -> dict[uuid.UUID, list[uuid.UUID]]:
        """item id → the ids it depends on, for one version's items."""
        stmt = (
            select(RoadmapItemDependencyRow)
            .join(RoadmapItemRow, RoadmapItemRow.id == RoadmapItemDependencyRow.item_id)
            .where(RoadmapItemRow.version_id == version_id)
        )
        grouped: dict[uuid.UUID, list[uuid.UUID]] = {}
        for dep in self._session.scalars(stmt):
            grouped.setdefault(dep.item_id, []).append(dep.depends_on_item_id)
        return grouped

    def dependency_exists(self, item_id: uuid.UUID, depends_on_item_id: uuid.UUID) -> bool:
        return (
            self._session.get(RoadmapItemDependencyRow, (item_id, depends_on_item_id)) is not None
        )

    def add_dependency(self, row: RoadmapItemDependencyRow) -> None:
        self._session.add(row)
        self._session.flush()

    def delete_dependency(self, item_id: uuid.UUID, depends_on_item_id: uuid.UUID) -> bool:
        row = self._session.get(RoadmapItemDependencyRow, (item_id, depends_on_item_id))
        if row is None:
            return False
        self._session.delete(row)
        self._session.flush()
        return True

    def add_event(self, row: RoadmapItemEventRow) -> None:
        self._session.add(row)


class SqlRoadmapExecutionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, row: RoadmapExecutionRow) -> None:
        self._session.add(row)
        self._session.flush()

    def get(self, execution_id: uuid.UUID) -> RoadmapExecutionRow | None:
        return self._session.get(RoadmapExecutionRow, execution_id)

    def list_for_item(self, item_id: uuid.UUID) -> list[RoadmapExecutionRow]:
        stmt = (
            select(RoadmapExecutionRow)
            .where(RoadmapExecutionRow.item_id == item_id)
            .order_by(RoadmapExecutionRow.created_at.desc())
        )
        return list(self._session.scalars(stmt))

    def list_for_version(self, version_id: uuid.UUID) -> list[RoadmapExecutionRow]:
        stmt = (
            select(RoadmapExecutionRow)
            .join(RoadmapItemRow, RoadmapItemRow.id == RoadmapExecutionRow.item_id)
            .where(RoadmapItemRow.version_id == version_id)
            .order_by(RoadmapExecutionRow.created_at.desc())
        )
        return list(self._session.scalars(stmt))

    def latest_per_item(self, version_id: uuid.UUID) -> dict[uuid.UUID, RoadmapExecutionRow]:
        """The newest execution per item of one version — the item's current execution state."""
        stmt = (
            select(RoadmapExecutionRow)
            .join(RoadmapItemRow, RoadmapItemRow.id == RoadmapExecutionRow.item_id)
            .where(RoadmapItemRow.version_id == version_id)
            .order_by(RoadmapExecutionRow.created_at.asc())
        )
        latest: dict[uuid.UUID, RoadmapExecutionRow] = {}
        for row in self._session.scalars(stmt):
            latest[row.item_id] = row  # ascending order → last write wins
        return latest

    def has_pending(self, item_id: uuid.UUID) -> bool:
        stmt = select(RoadmapExecutionRow.id).where(
            RoadmapExecutionRow.item_id == item_id,
            RoadmapExecutionRow.status == "pending",
        )
        return self._session.scalars(stmt).first() is not None


class SqlRoadmapConfigRepository:
    """The singleton roadmap-config row, seeded lazily with defaults."""

    _ROW_ID = 1

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_or_create(self) -> RoadmapConfigRow:
        row = self._session.get(RoadmapConfigRow, self._ROW_ID)
        if row is None:
            row = RoadmapConfigRow(
                id=self._ROW_ID,
                execution_timeout_seconds=900.0,
                drift_cadence="manual",
                updated_at=datetime.now(UTC),
            )
            self._session.add(row)
            self._session.flush()
        return row
