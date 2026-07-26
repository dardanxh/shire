"""Seeder for the security & data privacy catalogs: regulations + safety practices.

Reads every `data/security/regulations/*.json` (one file per regulation) and
`data/security/practices.json`, upserting by slug. Seed-sourced rows are refreshed to
match the files; user-sourced rows are skipped.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from shire.domain.security.models import DataRegulationRow, DataSafetyPracticeRow
from shire.domain.security.repositories import (
    SqlDataRegulationRepository,
    SqlDataSafetyPracticeRepository,
)

DATA_DIR = Path(__file__).parent / "data" / "security"

REGULATION_FIELDS = (
    "name",
    "full_name",
    "category",
    "region",
    "jurisdiction",
    "status",
    "effective_year",
    "effective_date",
    "description",
    "who_is_impacted",
    "penalties",
    "official_url",
    "unit_label",
    "articles",
    "triggering_data_classes",
    "related_practice_slugs",
    "related_technology_slugs",
    "position",
)

PRACTICE_FIELDS = (
    "name",
    "category",
    "objective",
    "description",
    "complexity",
    "implementation_steps",
    "satisfies",
    "related_technology_slugs",
    "related_practice_slugs",
    "position",
)


def seed_security(session: Session) -> dict[str, int]:
    """Upsert regulations then practices. Returns created/updated/skipped counts."""
    stats = {"created": 0, "updated": 0, "skipped_user": 0}
    _seed_regulations(session, stats)
    _seed_practices(session, stats)
    return stats


def _seed_regulations(session: Session, stats: dict[str, int]) -> None:
    repo = SqlDataRegulationRepository(session)
    entries: list[dict] = []
    for path in sorted((DATA_DIR / "regulations").glob("*.json")):
        entries.append(json.loads(path.read_text()))

    existing = {
        row.slug: row for row in repo.get_by_slugs([entry["slug"] for entry in entries])
    }
    for entry in entries:
        row = existing.get(entry["slug"])
        if row is None:
            repo.add_all(
                [
                    DataRegulationRow(
                        slug=entry["slug"],
                        source="seed",
                        **{field: entry[field] for field in REGULATION_FIELDS},
                    )
                ]
            )
            stats["created"] += 1
        elif row.source == "seed":
            for field in REGULATION_FIELDS:
                setattr(row, field, entry[field])
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()


def _seed_practices(session: Session, stats: dict[str, int]) -> None:
    repo = SqlDataSafetyPracticeRepository(session)
    entries = json.loads((DATA_DIR / "practices.json").read_text())

    existing = {
        row.slug: row for row in repo.get_by_slugs([entry["slug"] for entry in entries])
    }
    for entry in entries:
        row = existing.get(entry["slug"])
        if row is None:
            repo.add_all(
                [
                    DataSafetyPracticeRow(
                        slug=entry["slug"],
                        source="seed",
                        **{field: entry[field] for field in PRACTICE_FIELDS},
                    )
                ]
            )
            stats["created"] += 1
        elif row.source == "seed":
            for field in PRACTICE_FIELDS:
                setattr(row, field, entry[field])
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()
