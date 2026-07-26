"""ORM model for the data-modelling strategy catalog.

One row per modelling strategy (normal forms, warehouse methodologies, schema
patterns, NoSQL designs, ...). Nothing references strategies by id, so delete is a
plain delete — no archive seam.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base

TOPICS = ("modelling", "evolution", "serialization")
FAMILIES = (
    "normalization",
    "warehouse-methodologies",
    "dimensional-schemas",
    "nosql",
    "specialized",
    "slowly-changing-dimensions",
    "compatibility",
    "migration-patterns",
    "text-formats",
    "binary-row-formats",
    "columnar-formats",
)
COMPLEXITIES = ("low", "medium", "high")

_TOPIC_CHECK = "topic IN ({})".format(", ".join(f"'{topic}'" for topic in TOPICS))
_FAMILY_CHECK = "family IN ({})".format(", ".join(f"'{family}'" for family in FAMILIES))
_COMPLEXITY_CHECK = "complexity IN ({})".format(
    ", ".join(f"'{complexity}'" for complexity in COMPLEXITIES)
)


class ModellingStrategyRow(Base):
    __tablename__ = "modelling_strategies"
    __table_args__ = (
        CheckConstraint(_TOPIC_CHECK, name="ck_modelling_strategies_topic"),
        CheckConstraint(_FAMILY_CHECK, name="ck_modelling_strategies_family"),
        CheckConstraint(_COMPLEXITY_CHECK, name="ck_modelling_strategies_complexity"),
        CheckConstraint("source IN ('seed', 'user')", name="ck_modelling_strategies_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    # Which browse tab the strategy lives on; each family belongs to one topic.
    topic: Mapped[str] = mapped_column(String(20), default="modelling", index=True)
    family: Mapped[str] = mapped_column(String(40), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    # One-liner on when to reach for this strategy.
    best_for: Mapped[str] = mapped_column(String(300), default="")
    pros: Mapped[list[str]] = mapped_column(JSONB, default=list)
    cons: Mapped[list[str]] = mapped_column(JSONB, default=list)
    complexity: Mapped[str] = mapped_column(String(10), default="medium")
    origin_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    originator: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Worked example: {narrative, tables: [{name, columns, rows}], decisions}.
    example: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    # Mermaid source rendered on the detail page (erDiagram, flowchart, ...).
    diagram: Mapped[str] = mapped_column(Text, default="")
    # Technology corpus slugs that pair well with this strategy (soft references).
    related_technology_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Orders rows within a family (e.g. BCNF between 3NF and 4NF, not after 5NF).
    position: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(10), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
