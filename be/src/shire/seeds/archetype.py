"""Seeder for the project-archetype catalog (`data/archetypes.json`)."""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from shire.domain.archetype.models import ProjectArchetypeRow
from shire.domain.archetype.repositories import SqlArchetypeRepository

DATA_DIR = Path(__file__).parent / "data"

ARCHETYPE_FIELDS = (
    "name",
    "family",
    "summary",
    "description",
    "supports_greenfield",
    "supports_brownfield",
    "is_initiative",
    "typical_category_slugs",
    "default_blueprint_slugs",
    "seed_tier",
    "position",
)


def seed_archetypes(session: Session) -> dict[str, int]:
    stats = {"created": 0, "updated": 0, "skipped_user": 0}
    repo = SqlArchetypeRepository(session)
    entries = json.loads((DATA_DIR / "archetypes.json").read_text())
    existing = {row.slug: row for row in repo.list_all()}

    for entry in entries:
        row = existing.get(entry["slug"])
        if row is None:
            repo.add_all(
                [
                    ProjectArchetypeRow(
                        slug=entry["slug"],
                        source="seed",
                        **{field: entry[field] for field in ARCHETYPE_FIELDS},
                    )
                ]
            )
            stats["created"] += 1
        elif row.source == "seed":
            for field in ARCHETYPE_FIELDS:
                setattr(row, field, entry[field])
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()
    return stats
