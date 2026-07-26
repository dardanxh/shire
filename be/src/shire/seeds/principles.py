"""Seeder for the golden principles.

Reads `data/principles.json` (one array), upserting by slug. Seed-sourced rows are
refreshed to match the file; user-sourced rows (authored, edited, or disabled by the
user) are never touched.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from shire.domain.principles.models import PrincipleRow

DATA_FILE = Path(__file__).parent / "data" / "principles.json"

PRINCIPLE_FIELDS = ("name", "statement", "severity", "tech", "enabled")


def seed_principles(session: Session) -> dict[str, int]:
    """Upsert global principles by slug. Returns created/updated/skipped counts."""
    stats = {"created": 0, "updated": 0, "skipped_user": 0}
    entries: list[dict] = json.loads(DATA_FILE.read_text())

    slugs = [entry["slug"] for entry in entries]
    existing = {
        row.slug: row
        for row in session.scalars(select(PrincipleRow).where(PrincipleRow.slug.in_(slugs)))
    }
    now = datetime.now(UTC)
    for entry in entries:
        row = existing.get(entry["slug"])
        if row is None:
            session.add(
                PrincipleRow(
                    slug=entry["slug"],
                    source="seed",
                    repository_id=None,
                    created_at=now,
                    updated_at=now,
                    **{field: entry[field] for field in PRINCIPLE_FIELDS},
                )
            )
            stats["created"] += 1
        elif row.source == "seed":
            for field in PRINCIPLE_FIELDS:
                setattr(row, field, entry[field])
            row.updated_at = now
            stats["updated"] += 1
        else:
            stats["skipped_user"] += 1
    session.flush()
    return stats
