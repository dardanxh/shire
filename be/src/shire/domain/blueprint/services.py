"""Blueprint service: library CRUD with corpus-validated stages."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from shire.core.exceptions import ConflictError, NotFoundError, ValidationError
from shire.domain.blueprint.models import (
    ArchitectureBlueprintRow,
    BlueprintStageRow,
)
from shire.domain.blueprint.repositories import SqlBlueprintRepository
from shire.domain.blueprint.schemas import (
    BlueprintResult,
    CreateBlueprint,
    CreateBlueprintStage,
    UpdateBlueprint,
)
from shire.domain.technology.services import TechnologyService


class BlueprintService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._blueprints = SqlBlueprintRepository(session)

    # -- library ----------------------------------------------------------------------

    def list_blueprints(
        self,
        family_tag: str | None = None,
        technology_id: uuid.UUID | None = None,
        q: str | None = None,
        source: str | None = None,
        use_case: str | None = None,
    ) -> list[BlueprintResult]:
        rows = self._blueprints.search(
            family_tag=family_tag,
            technology_id=technology_id,
            q=q,
            source=source,
            use_case=use_case,
        )
        return [BlueprintResult.model_validate(row) for row in rows]

    def clone_blueprint(
        self, blueprint_id: uuid.UUID, name: str | None = None
    ) -> BlueprintResult:
        """Copy a blueprint into a new editable user architecture. Stage ids are
        regenerated (and flows remapped to them) so the copy is fully independent."""
        source = self._get_rows([blueprint_id])[0]

        # New stage ids, keyed by the old id, so flows can be remapped.
        id_map = {stage.id: uuid.uuid4() for stage in source.stages}
        stages = [
            BlueprintStageRow(
                id=id_map[stage.id],
                position=stage.position,
                name=stage.name,
                role=stage.role,
                recommended_technology_id=stage.recommended_technology_id,
                alternative_technology_ids=list(stage.alternative_technology_ids),
                rationale=stage.rationale,
                pos_x=stage.pos_x,
                pos_y=stage.pos_y,
                width=stage.width,
                height=stage.height,
                custom_color=stage.custom_color,
                environment=stage.environment,
                owner_name=stage.owner_name,
                owner_email=stage.owner_email,
            )
            for stage in source.stages
        ]
        flows = [
            {
                **flow,
                "source_stage_id": str(id_map[uuid.UUID(flow["source_stage_id"])]),
                "target_stage_id": str(id_map[uuid.UUID(flow["target_stage_id"])]),
            }
            for flow in source.flows
        ]

        row = ArchitectureBlueprintRow(
            slug=self._unique_slug(f"{source.slug}-copy"),
            name=name or f"{source.name} (copy)",
            use_case=source.use_case,
            description=source.description,
            when_to_use=list(source.when_to_use),
            when_not_to_use=list(source.when_not_to_use),
            use_cases=list(source.use_cases),
            hot_spots=[dict(spot) for spot in source.hot_spots],
            complexity=source.complexity,
            evolution=[dict(edge) for edge in source.evolution],
            diagrams=[dict(diagram) for diagram in source.diagrams],
            family_tags=list(source.family_tags),
            flows=flows,
            position=source.position,
            source="user",
        )
        row.stages = stages
        self._blueprints.add_all([row])
        self._session.flush()
        return BlueprintResult.model_validate(row)

    def _unique_slug(self, base: str) -> str:
        base = base[:160]
        if not self._blueprints.get_by_slugs([base]):
            return base
        for suffix in range(2, 1000):
            candidate = f"{base[:156]}-{suffix}"
            if not self._blueprints.get_by_slugs([candidate]):
                return candidate
        raise ConflictError(f"Could not derive a unique slug from '{base}'.")

    def get_blueprints(self, blueprint_ids: list[uuid.UUID]) -> list[BlueprintResult]:
        return [BlueprintResult.model_validate(row) for row in self._get_rows(blueprint_ids)]

    def create_blueprints(self, blueprints: list[CreateBlueprint]) -> list[BlueprintResult]:
        slugs = [blueprint.slug for blueprint in blueprints]
        if self._blueprints.get_by_slugs(slugs):
            raise ConflictError(f"Blueprint slug already exists: {slugs}")
        rows: list[ArchitectureBlueprintRow] = []
        for blueprint in blueprints:
            self._validate_stage_technologies(blueprint.stages)
            row = ArchitectureBlueprintRow(
                **blueprint.model_dump(mode="json", exclude={"stages"}),
                source="user",
            )
            row.stages = self._build_stage_rows(blueprint.stages)
            self._validate_canvas_state(row)
            rows.append(row)
        self._blueprints.add_all(rows)
        self._session.flush()
        return [BlueprintResult.model_validate(row) for row in rows]

    def update_blueprints(
        self, updates: list[tuple[uuid.UUID, UpdateBlueprint]]
    ) -> list[BlueprintResult]:
        rows = self._get_rows([blueprint_id for blueprint_id, _ in updates])
        for row, (_, update) in zip(rows, updates, strict=True):
            changes = update.model_dump(mode="json", exclude_unset=True)
            slug_taken = (
                "slug" in changes
                and changes["slug"] != row.slug
                and self._blueprints.get_by_slugs([changes["slug"]])
            )
            if slug_taken:
                raise ConflictError(f"Blueprint slug already exists: {changes['slug']}")
            if update.stages is not None:
                self._validate_stage_technologies(update.stages)
                self._apply_stages(row, update.stages)
                changes.pop("stages", None)
            for field, value in changes.items():
                setattr(row, field, value)
            self._validate_canvas_state(row)
            row.source = "user"
        # Flush before serializing — newly inserted stage rows get their ids at flush.
        self._session.flush()
        return [BlueprintResult.model_validate(row) for row in rows]

    def delete_blueprints(self, blueprint_ids: list[uuid.UUID]) -> None:
        rows = self._get_rows(blueprint_ids)
        self._blueprints.delete_all(rows)
        self._session.flush()

    # -- helpers ----------------------------------------------------------------------

    def _validate_stage_technologies(self, stages: list[CreateBlueprintStage]) -> None:
        technology_ids: set[uuid.UUID] = set()
        for stage in stages:
            if stage.recommended_technology_id is not None:
                technology_ids.add(stage.recommended_technology_id)
            technology_ids.update(stage.alternative_technology_ids)
        if technology_ids:
            TechnologyService(self._session).get_technologies(list(technology_ids))

    def _build_stage_rows(self, stages: list[CreateBlueprintStage]) -> list[BlueprintStageRow]:
        return [
            BlueprintStageRow(
                id=stage.id or uuid.uuid4(),
                position=position,
                name=stage.name,
                role=stage.role,
                recommended_technology_id=stage.recommended_technology_id,
                alternative_technology_ids=[
                    str(tid) for tid in stage.alternative_technology_ids
                ],
                rationale=stage.rationale,
                pos_x=stage.pos_x,
                pos_y=stage.pos_y,
                width=stage.width,
                height=stage.height,
                custom_color=stage.custom_color,
                environment=stage.environment,
                owner_name=stage.owner_name,
                owner_email=stage.owner_email,
            )
            for position, stage in enumerate(stages)
        ]

    def _apply_stages(
        self, row: ArchitectureBlueprintRow, stages: list[CreateBlueprintStage]
    ) -> None:
        """Upsert stages by id: existing ids keep their identity (so flows/positions/
        adoption choices survive), new ones are inserted, missing ones are orphan-deleted."""
        existing = {stage.id: stage for stage in row.stages}
        applied: list[BlueprintStageRow] = []
        for position, incoming in enumerate(stages):
            target = existing.get(incoming.id) if incoming.id else None
            if target is None:
                target = BlueprintStageRow(id=incoming.id or uuid.uuid4())
            target.position = position
            target.name = incoming.name
            target.role = incoming.role
            target.recommended_technology_id = incoming.recommended_technology_id
            target.alternative_technology_ids = [
                str(tid) for tid in incoming.alternative_technology_ids
            ]
            target.rationale = incoming.rationale
            target.pos_x = incoming.pos_x
            target.pos_y = incoming.pos_y
            target.width = incoming.width
            target.height = incoming.height
            target.custom_color = incoming.custom_color
            target.environment = incoming.environment
            target.owner_name = incoming.owner_name
            target.owner_email = incoming.owner_email
            applied.append(target)
        # Reassigning the collection orphan-deletes any stage no longer present.
        row.stages = applied

    def _validate_canvas_state(self, row: ArchitectureBlueprintRow) -> None:
        """Every flow endpoint must resolve to a stage in the blueprint."""
        stage_ids = {stage.id for stage in row.stages}
        for flow in row.flows:
            source = uuid.UUID(flow["source_stage_id"])
            target = uuid.UUID(flow["target_stage_id"])
            if source not in stage_ids or target not in stage_ids:
                raise ValidationError(
                    f"Flow '{flow.get('id')}' references a stage not in the blueprint."
                )

    def _get_rows(self, blueprint_ids: list[uuid.UUID]) -> list[ArchitectureBlueprintRow]:
        rows = {row.id: row for row in self._blueprints.get(blueprint_ids)}
        missing = [str(bid) for bid in blueprint_ids if bid not in rows]
        if missing:
            raise NotFoundError(f"Blueprint not found: {', '.join(missing)}")
        return [rows[blueprint_id] for blueprint_id in blueprint_ids]
