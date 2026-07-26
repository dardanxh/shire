"""Seeder for the data-modelling strategy catalog (`data/modelling_strategies.json`)."""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy.orm import Session

from shire.domain.modelling.models import ModellingStrategyRow
from shire.domain.modelling.repositories import SqlModellingStrategyRepository

DATA_DIR = Path(__file__).parent / "data"

MODELLING_STRATEGY_FIELDS = (
    "name",
    "topic",
    "family",
    "description",
    "best_for",
    "pros",
    "cons",
    "complexity",
    "origin_year",
    "originator",
    "example",
    "diagram",
    "related_technology_slugs",
    "position",
)


def seed_modelling_strategies(session: Session) -> dict[str, int]:
    stats = {"created": 0, "updated": 0, "skipped_user": 0}
    repo = SqlModellingStrategyRepository(session)
    entries = json.loads((DATA_DIR / "modelling_strategies.json").read_text())
    existing = {row.slug: row for row in repo.list_all()}

    for entry in entries:
        row = existing.get(entry["slug"])
        if row is None:
            repo.add_all(
                [
                    ModellingStrategyRow(
                        slug=entry["slug"],
                        source="seed",
                        **{field: entry[field] for field in MODELLING_STRATEGY_FIELDS},
                    )
                ]
            )
            stats["created"] += 1
        elif row.source == "seed":
            for field in MODELLING_STRATEGY_FIELDS:
                setattr(row, field, entry[field])
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()
    return stats
