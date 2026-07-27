"""Data access for the technology corpus. Entities in, entities out."""

from __future__ import annotations

import uuid

from fastapi_pagination import Params
from fastapi_pagination.bases import AbstractPage
from fastapi_pagination.ext.sqlalchemy import paginate
from sqlalchemy import Select, Text, case, exists, func, select
from sqlalchemy import or_ as sa_or
from sqlalchemy.orm import Session

from shire.domain.technology.models import TechCategoryRow, TechnologyRow


def _ordering(order_by: str | None):
    """ORDER BY clauses for the corpus search. Tier enums sort by rank (not alphabetically);
    unknown/None falls back to the default name ordering."""
    if order_by == "created_at":
        return (TechnologyRow.created_at.desc(), TechnologyRow.name)
    if order_by == "cost_tier":
        rank = case(
            {"free": 0, "low": 1, "medium": 2, "high": 3},
            value=TechnologyRow.cost_tier,
            else_=4,
        )
        return (rank, TechnologyRow.name)
    if order_by == "time_to_win":
        rank = case(
            {"hours": 0, "days": 1, "weeks": 2},
            value=TechnologyRow.time_to_win,
            else_=3,
        )
        return (rank, TechnologyRow.name)
    return (TechnologyRow.name,)


class SqlTechCategoryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_all(self) -> list[TechCategoryRow]:
        return list(
            self._session.scalars(
                select(TechCategoryRow).order_by(TechCategoryRow.position, TechCategoryRow.name)
            )
        )

    def get(self, category_ids: list[uuid.UUID]) -> list[TechCategoryRow]:
        if not category_ids:
            return []
        return list(
            self._session.scalars(
                select(TechCategoryRow).where(TechCategoryRow.id.in_(category_ids))
            )
        )

    def get_by_slugs(self, slugs: list[str]) -> list[TechCategoryRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(select(TechCategoryRow).where(TechCategoryRow.slug.in_(slugs)))
        )

    def add_all(self, categories: list[TechCategoryRow]) -> None:
        self._session.add_all(categories)

    def delete_all(self, categories: list[TechCategoryRow]) -> None:
        for category in categories:
            self._session.delete(category)

    def child_ids(self, category_id: uuid.UUID) -> list[uuid.UUID]:
        return list(
            self._session.scalars(
                select(TechCategoryRow.id).where(TechCategoryRow.parent_id == category_id)
            )
        )

    def has_children(self, category_id: uuid.UUID) -> bool:
        return bool(
            self._session.scalar(
                select(exists().where(TechCategoryRow.parent_id == category_id))
            )
        )

    def technology_counts(self) -> dict[uuid.UUID, int]:
        """Primary-category technology counts, keyed by category id."""
        rows = self._session.execute(
            select(TechnologyRow.category_id, func.count()).group_by(TechnologyRow.category_id)
        ).all()
        return dict(rows)  # type: ignore[arg-type]


class SqlTechnologyRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def search(
        self,
        params: Params,
        transformer,
        category_ids: list[uuid.UUID] | None = None,
        q: str | None = None,
        maturity: str | None = None,
        deployment: str | None = None,
        oss: bool | None = None,
        starred: bool | None = None,
        time_to_win: str | None = None,
        cost_model: str | None = None,
        cost_tier: str | None = None,
        order_by: str | None = None,
    ) -> AbstractPage:
        query: Select = select(TechnologyRow).order_by(*_ordering(order_by))
        if category_ids:
            id_strings = [str(category_id) for category_id in category_ids]
            secondary_match = sa_or(
                *(TechnologyRow.secondary_category_ids.contains([s]) for s in id_strings)
            )
            query = query.where(
                TechnologyRow.category_id.in_(category_ids) | secondary_match
            )
        if q:
            pattern = f"%{q}%"
            # Free-text search across the human-facing fields: name, description, tags,
            # plus slug/aliases for discoverability. JSONB arrays are matched via their text
            # representation (same trick as elsewhere).
            query = query.where(
                TechnologyRow.name.ilike(pattern)
                | TechnologyRow.slug.ilike(pattern)
                | TechnologyRow.description.ilike(pattern)
                | TechnologyRow.aliases.cast(Text).ilike(pattern)
                | TechnologyRow.tags.cast(Text).ilike(pattern)
            )
        if maturity:
            query = query.where(TechnologyRow.maturity == maturity)
        if deployment:
            query = query.where(TechnologyRow.deployment_models.contains([deployment]))
        if oss is not None:
            query = query.where(TechnologyRow.oss.is_(oss))
        if starred is not None:
            query = query.where(TechnologyRow.starred.is_(starred))
        if time_to_win:
            query = query.where(TechnologyRow.time_to_win == time_to_win)
        if cost_model:
            query = query.where(TechnologyRow.cost_model == cost_model)
        if cost_tier:
            query = query.where(TechnologyRow.cost_tier == cost_tier)
        return paginate(self._session, query, params, transformer=transformer)

    def get(self, technology_ids: list[uuid.UUID]) -> list[TechnologyRow]:
        if not technology_ids:
            return []
        return list(
            self._session.scalars(
                select(TechnologyRow).where(TechnologyRow.id.in_(technology_ids))
            )
        )

    def get_by_slugs(self, slugs: list[str]) -> list[TechnologyRow]:
        if not slugs:
            return []
        return list(
            self._session.scalars(select(TechnologyRow).where(TechnologyRow.slug.in_(slugs)))
        )

    def add_all(self, technologies: list[TechnologyRow]) -> None:
        self._session.add_all(technologies)

    def delete_all(self, technologies: list[TechnologyRow]) -> None:
        for technology in technologies:
            self._session.delete(technology)

    def references_category(self, category_id: uuid.UUID) -> bool:
        """True if any technology uses the category as primary or secondary."""
        return bool(
            self._session.scalar(
                select(
                    exists().where(
                        (TechnologyRow.category_id == category_id)
                        | TechnologyRow.secondary_category_ids.contains([str(category_id)])
                    )
                )
            )
        )
