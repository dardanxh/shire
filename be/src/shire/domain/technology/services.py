"""Technology corpus service: business logic over categories and technologies.

Bulk-shaped per project convention (lists in, lists out); routes wrap single resources into
one-element lists. User-driven edits flip `source` to `user` so re-seeding never clobbers them.
"""

from __future__ import annotations

import uuid

from fastapi_pagination import Page, Params
from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.domain.technology.models import TechCategoryRow, TechnologyRow
from shire.domain.technology.repositories import (
    SqlTechCategoryRepository,
    SqlTechnologyRepository,
)
from shire.domain.technology.schemas import (
    CreateTechCategory,
    CreateTechnology,
    TechCategoryResult,
    TechCategoryTreeResult,
    TechnologyBlueprintRef,
    TechnologyResult,
    UpdateTechCategory,
    UpdateTechnology,
)


class TechnologyService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._categories = SqlTechCategoryRepository(session)
        self._technologies = SqlTechnologyRepository(session)

    # -- categories -------------------------------------------------------------------

    def category_tree(self) -> list[TechCategoryTreeResult]:
        rows = self._categories.list_all()
        counts = self._categories.technology_counts()
        nodes = {
            row.id: TechCategoryTreeResult(
                id=row.id,
                slug=row.slug,
                name=row.name,
                parent_id=row.parent_id,
                position=row.position,
                source=row.source,  # type: ignore[arg-type]
                technology_count=counts.get(row.id, 0),
            )
            for row in rows
        }
        roots: list[TechCategoryTreeResult] = []
        for row in rows:
            node = nodes[row.id]
            if row.parent_id is None:
                roots.append(node)
            else:
                nodes[row.parent_id].children.append(node)
        # Group counts roll up their categories'.
        for root in roots:
            root.technology_count += sum(child.technology_count for child in root.children)
        return roots

    def create_categories(self, categories: list[CreateTechCategory]) -> list[TechCategoryResult]:
        slugs = [category.slug for category in categories]
        if self._categories.get_by_slugs(slugs):
            raise ConflictError(f"Category slug already exists: {slugs}")
        parent_ids = [c.parent_id for c in categories if c.parent_id is not None]
        parents = {row.id for row in self._categories.get(parent_ids)}
        rows: list[TechCategoryRow] = []
        for category in categories:
            if category.parent_id is not None and category.parent_id not in parents:
                raise NotFoundError(f"Parent category not found: {category.parent_id}")
            rows.append(
                TechCategoryRow(
                    slug=category.slug,
                    name=category.name,
                    parent_id=category.parent_id,
                    position=category.position,
                    source="user",
                )
            )
        self._categories.add_all(rows)
        self._session.flush()
        return [TechCategoryResult.model_validate(row) for row in rows]

    def update_categories(
        self, updates: list[tuple[uuid.UUID, UpdateTechCategory]]
    ) -> list[TechCategoryResult]:
        rows = self._get_categories([category_id for category_id, _ in updates])
        results: list[TechCategoryResult] = []
        for row, (_, update) in zip(rows, updates, strict=True):
            changes = update.model_dump(exclude_unset=True)
            slug_taken = (
                "slug" in changes
                and changes["slug"] != row.slug
                and self._categories.get_by_slugs([changes["slug"]])
            )
            if slug_taken:
                raise ConflictError(f"Category slug already exists: {changes['slug']}")
            if changes.get("parent_id") is not None:
                if changes["parent_id"] == row.id:
                    raise ValidationError("A category cannot be its own parent.")
                if not self._categories.get([changes["parent_id"]]):
                    raise NotFoundError(f"Parent category not found: {changes['parent_id']}")
            for field, value in changes.items():
                setattr(row, field, value)
            row.source = "user"
            results.append(TechCategoryResult.model_validate(row))
        self._session.flush()
        return results

    def delete_categories(self, category_ids: list[uuid.UUID]) -> None:
        rows = self._get_categories(category_ids)
        for row in rows:
            if self._categories.has_children(row.id):
                raise ConflictError(f"Category '{row.slug}' still has subcategories.")
            if self._technologies.references_category(row.id):
                raise ConflictError(f"Category '{row.slug}' still has technologies.")
        self._categories.delete_all(rows)
        self._session.flush()

    def _get_categories(self, category_ids: list[uuid.UUID]) -> list[TechCategoryRow]:
        rows = {row.id: row for row in self._categories.get(category_ids)}
        missing = [str(cid) for cid in category_ids if cid not in rows]
        if missing:
            raise NotFoundError(f"Category not found: {', '.join(missing)}")
        return [rows[category_id] for category_id in category_ids]

    # -- technologies -----------------------------------------------------------------

    def list_technologies(
        self,
        params: Params,
        category: str | None = None,
        q: str | None = None,
        maturity: str | None = None,
        deployment: str | None = None,
        oss: bool | None = None,
        starred: bool | None = None,
        time_to_win: str | None = None,
        cost_model: str | None = None,
        cost_tier: str | None = None,
        order_by: str | None = None,
    ) -> Page[TechnologyResult]:
        category_ids: list[uuid.UUID] | None = None
        if category:
            matches = self._categories.get_by_slugs([category])
            if not matches:
                raise NotFoundError(f"Category not found: {category}")
            root = matches[0]
            # Filtering by a group includes all of its categories.
            category_ids = [root.id, *self._categories.child_ids(root.id)]
        transformer = lambda rows: [TechnologyResult.model_validate(row) for row in rows]  # noqa: E731
        return self._technologies.search(
            params,
            transformer,
            category_ids=category_ids,
            q=q,
            maturity=maturity,
            deployment=deployment,
            oss=oss,
            starred=starred,
            time_to_win=time_to_win,
            cost_model=cost_model,
            cost_tier=cost_tier,
            order_by=order_by,
        )

    def get_technology_blueprints(
        self, technology_id: uuid.UUID
    ) -> list[TechnologyBlueprintRef]:
        """Architecture blueprints whose stages recommend or list this technology."""
        self._get_technology_rows([technology_id])  # 404 on unknown id
        # Late import: blueprint imports technology for validation.
        from shire.domain.blueprint.models import (
            ArchitectureBlueprintRow,
            BlueprintStageRow,
        )

        rows = self._session.execute(
            select(BlueprintStageRow, ArchitectureBlueprintRow)
            .join(
                ArchitectureBlueprintRow,
                BlueprintStageRow.blueprint_id == ArchitectureBlueprintRow.id,
            )
            .where(
                (BlueprintStageRow.recommended_technology_id == technology_id)
                | BlueprintStageRow.alternative_technology_ids.contains(
                    [str(technology_id)]
                )
            )
            .order_by(ArchitectureBlueprintRow.position, BlueprintStageRow.position)
        ).all()
        return [
            TechnologyBlueprintRef(
                blueprint_id=blueprint.id,
                blueprint_name=blueprint.name,
                stage_name=stage.name,
                role=(
                    "recommended"
                    if stage.recommended_technology_id == technology_id
                    else "alternative"
                ),
            )
            for stage, blueprint in rows
        ]

    def get_technologies(self, technology_ids: list[uuid.UUID]) -> list[TechnologyResult]:
        rows = self._get_technology_rows(technology_ids)
        return [TechnologyResult.model_validate(row) for row in rows]

    def create_technologies(self, technologies: list[CreateTechnology]) -> list[TechnologyResult]:
        slugs = [technology.slug for technology in technologies]
        if self._technologies.get_by_slugs(slugs):
            raise ConflictError(f"Technology slug already exists: {slugs}")
        rows: list[TechnologyRow] = []
        for technology in technologies:
            self._require_categories(
                [technology.category_id, *technology.secondary_category_ids]
            )
            rows.append(
                TechnologyRow(
                    **technology.model_dump(exclude={"secondary_category_ids"}),
                    secondary_category_ids=[
                        str(category_id) for category_id in technology.secondary_category_ids
                    ],
                    source="user",
                )
            )
        self._technologies.add_all(rows)
        self._session.flush()
        return [TechnologyResult.model_validate(row) for row in rows]

    def update_technologies(
        self, updates: list[tuple[uuid.UUID, UpdateTechnology]]
    ) -> list[TechnologyResult]:
        rows = self._get_technology_rows([technology_id for technology_id, _ in updates])
        results: list[TechnologyResult] = []
        for row, (_, update) in zip(rows, updates, strict=True):
            changes = update.model_dump(exclude_unset=True)
            slug_taken = (
                "slug" in changes
                and changes["slug"] != row.slug
                and self._technologies.get_by_slugs([changes["slug"]])
            )
            if slug_taken:
                raise ConflictError(f"Technology slug already exists: {changes['slug']}")
            referenced: list[uuid.UUID] = []
            if changes.get("category_id") is not None:
                referenced.append(changes["category_id"])
            if changes.get("secondary_category_ids") is not None:
                referenced.extend(changes["secondary_category_ids"])
                changes["secondary_category_ids"] = [
                    str(category_id) for category_id in changes["secondary_category_ids"]
                ]
            self._require_categories(referenced)
            for field, value in changes.items():
                setattr(row, field, value)
            # Starring alone is curation, not content editing — leave `source`
            # untouched so seed refreshes keep updating the row.
            if set(changes) != {"starred"}:
                row.source = "user"
            results.append(TechnologyResult.model_validate(row))
        self._session.flush()
        return results

    def delete_technologies(self, technology_ids: list[uuid.UUID]) -> None:
        rows = self._get_technology_rows(technology_ids)
        # Guard the RESTRICT FK from blueprint stages: surface a 409 instead of a 500.
        for row in rows:
            if self.get_technology_blueprints(row.id):
                raise ConflictError(
                    f"Technology '{row.slug}' is referenced by blueprint stages."
                )
        self._technologies.delete_all(rows)
        self._session.flush()

    def _get_technology_rows(self, technology_ids: list[uuid.UUID]) -> list[TechnologyRow]:
        rows = {row.id: row for row in self._technologies.get(technology_ids)}
        missing = [str(tid) for tid in technology_ids if tid not in rows]
        if missing:
            raise NotFoundError(f"Technology not found: {', '.join(missing)}")
        return [rows[technology_id] for technology_id in technology_ids]

    def _require_categories(self, category_ids: list[uuid.UUID]) -> None:
        unique = list(set(category_ids))
        found = {row.id for row in self._categories.get(unique)}
        missing = [str(cid) for cid in unique if cid not in found]
        if missing:
            raise NotFoundError(f"Category not found: {', '.join(missing)}")
