"""Seeder for the technology corpus: category tree + technologies.

Reads `data/technology_categories.json` and every `data/technologies/*.json`, upserting by
slug. Seed-sourced rows are refreshed to match the files; user-sourced rows are skipped.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from shire.domain.technology.models import TechCategoryRow, TechnologyRow
from shire.domain.technology.repositories import (
    SqlTechCategoryRepository,
    SqlTechnologyRepository,
)

DATA_DIR = Path(__file__).parent / "data"

TECHNOLOGY_FIELDS = (
    "name",
    "description",
    "homepage_url",
    "aliases",
    "deployment_models",
    "oss",
    "maturity",
    "learning_curve",
    "time_to_win",
    "cost_model",
    "cost_tier",
    "tags",
)


def seed_technology(session: Session) -> dict[str, int]:
    """Upsert categories then technologies. Returns per-kind created/updated/skipped counts."""
    stats = {"created": 0, "updated": 0, "skipped_user": 0}
    categories_by_slug = _seed_categories(session, stats)
    _seed_technologies(session, categories_by_slug, stats)
    return stats


def _seed_categories(session: Session, stats: dict[str, int]) -> dict[str, uuid.UUID]:
    repo = SqlTechCategoryRepository(session)
    entries = json.loads((DATA_DIR / "technology_categories.json").read_text())
    existing = {row.slug: row for row in repo.list_all()}
    ids_by_slug: dict[str, uuid.UUID] = {slug: row.id for slug, row in existing.items()}

    # Parents (groups, parent_slug null) come before children in the file order.
    for entry in sorted(entries, key=lambda e: e["parent_slug"] is not None):
        parent_id = ids_by_slug[entry["parent_slug"]] if entry["parent_slug"] else None
        row = existing.get(entry["slug"])
        if row is None:
            row = TechCategoryRow(
                slug=entry["slug"],
                name=entry["name"],
                parent_id=parent_id,
                position=entry.get("position", 0),
                source="seed",
            )
            repo.add_all([row])
            session.flush()
            stats["created"] += 1
        elif row.source == "seed":
            row.name = entry["name"]
            row.parent_id = parent_id
            row.position = entry.get("position", 0)
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
        ids_by_slug[entry["slug"]] = row.id
    session.flush()
    return ids_by_slug


def _seed_technologies(
    session: Session, ids_by_slug: dict[str, uuid.UUID], stats: dict[str, int]
) -> None:
    repo = SqlTechnologyRepository(session)
    entries: list[dict] = []
    for path in sorted((DATA_DIR / "technologies").glob("*.json")):
        entries.extend(json.loads(path.read_text()))

    existing = {
        row.slug: row for row in repo.get_by_slugs([entry["slug"] for entry in entries])
    }
    for entry in entries:
        category_id = ids_by_slug[entry["category_slug"]]
        secondary_ids = [
            str(ids_by_slug[slug]) for slug in entry.get("secondary_category_slugs", [])
        ]
        row = existing.get(entry["slug"])
        if row is None:
            repo.add_all(
                [
                    TechnologyRow(
                        slug=entry["slug"],
                        category_id=category_id,
                        secondary_category_ids=secondary_ids,
                        auth_methods=entry.get("auth_methods", []),
                        source="seed",
                        **{field: entry[field] for field in TECHNOLOGY_FIELDS},
                    )
                ]
            )
            stats["created"] += 1
        elif row.source == "seed":
            row.category_id = category_id
            row.secondary_category_ids = secondary_ids
            row.auth_methods = entry.get("auth_methods", [])
            for field in TECHNOLOGY_FIELDS:
                setattr(row, field, entry[field])
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()
