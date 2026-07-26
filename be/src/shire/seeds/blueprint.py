"""Seeder for architecture blueprints (`data/blueprints/*.json`).

Stage technology references arrive as corpus slugs and are resolved to ids; a missing slug
is a hard error (seed integrity). Seed-sourced blueprints are refreshed wholesale (stages
replaced); user-sourced ones are skipped.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from shire.domain.blueprint.models import ArchitectureBlueprintRow, BlueprintStageRow
from shire.domain.blueprint.repositories import SqlBlueprintRepository
from shire.domain.technology.repositories import SqlTechnologyRepository

DATA_DIR = Path(__file__).parent / "data"

BLUEPRINT_FIELDS = (
    "name",
    "use_case",
    "description",
    "when_to_use",
    "when_not_to_use",
    "use_cases",
    "hot_spots",
    "complexity",
    "evolution",
    "diagrams",
    "family_tags",
    "position",
)


def seed_blueprints(session: Session) -> dict[str, int]:
    stats = {"created": 0, "updated": 0, "skipped_user": 0}
    repo = SqlBlueprintRepository(session)
    entries = [
        json.loads(path.read_text())
        for path in sorted((DATA_DIR / "blueprints").glob("*.json"))
    ]
    if not entries:
        return stats

    technology_ids = _technology_ids_by_slug(session, entries)
    existing = {
        row.slug: row for row in repo.get_by_slugs([entry["slug"] for entry in entries])
    }
    for entry in entries:
        row = existing.get(entry["slug"])
        stages = _build_stages(entry["stages"], technology_ids)
        if row is None:
            row = ArchitectureBlueprintRow(
                slug=entry["slug"],
                source="seed",
                **{field: entry[field] for field in BLUEPRINT_FIELDS},
            )
            row.stages = stages
            repo.add_all([row])
            stats["created"] += 1
        elif row.source == "seed":
            for field in BLUEPRINT_FIELDS:
                setattr(row, field, entry[field])
            row.stages = stages
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()
    return stats


def _technology_ids_by_slug(session: Session, entries: list[dict]) -> dict[str, str]:
    slugs: set[str] = set()
    for entry in entries:
        for stage in entry["stages"]:
            if stage.get("recommended_technology_slug"):
                slugs.add(stage["recommended_technology_slug"])
            slugs.update(stage.get("alternative_technology_slugs", []))
    rows = SqlTechnologyRepository(session).get_by_slugs(sorted(slugs))
    found = {row.slug: str(row.id) for row in rows}
    missing = slugs - set(found)
    if missing:
        raise ValueError(
            f"Blueprint seeds reference unknown technology slugs: {', '.join(sorted(missing))}"
            " — seed the technology corpus first."
        )
    return found


def _build_stages(
    stage_entries: list[dict], technology_ids: dict[str, str]
) -> list[BlueprintStageRow]:
    stages: list[BlueprintStageRow] = []
    for position, stage in enumerate(stage_entries):
        recommended_slug = stage.get("recommended_technology_slug")
        stages.append(
            BlueprintStageRow(
                position=position,
                name=stage["name"],
                role=stage.get("role", ""),
                recommended_technology_id=(
                    technology_ids[recommended_slug] if recommended_slug else None
                ),
                alternative_technology_ids=[
                    technology_ids[slug]
                    for slug in stage.get("alternative_technology_slugs", [])
                ],
                rationale=stage.get("rationale", ""),
            )
        )
    return stages
