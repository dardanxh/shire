"""Seeder for the architecture-qualities catalog.

Reads every `data/qualities/*.json` (one file per quality), upserting by slug.
Seed-sourced rows are refreshed to match the files; user-sourced rows are skipped.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from shire.domain.qualities.models import ArchitectureQualityRow
from shire.domain.qualities.repositories import SqlArchitectureQualityRepository

DATA_DIR = Path(__file__).parent / "data" / "qualities"

QUALITY_FIELDS = (
    "name",
    "category",
    "summary",
    "description",
    "mechanisms",
    "manifestations",
    "tradeoffs",
    "related_technology_slugs",
    "related_quality_slugs",
    "position",
)


def seed_qualities(session: Session) -> dict[str, int]:
    """Upsert qualities by slug. Returns created/updated/skipped counts."""
    stats = {"created": 0, "updated": 0, "skipped_user": 0}
    repo = SqlArchitectureQualityRepository(session)
    entries: list[dict] = [
        json.loads(path.read_text()) for path in sorted(DATA_DIR.glob("*.json"))
    ]

    existing = {
        row.slug: row for row in repo.get_by_slugs([entry["slug"] for entry in entries])
    }
    for entry in entries:
        row = existing.get(entry["slug"])
        if row is None:
            repo.add_all(
                [
                    ArchitectureQualityRow(
                        slug=entry["slug"],
                        source="seed",
                        **{field: entry[field] for field in QUALITY_FIELDS},
                    )
                ]
            )
            stats["created"] += 1
        elif row.source == "seed":
            for field in QUALITY_FIELDS:
                setattr(row, field, entry[field])
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()
    return stats
