"""ORM model for project archetypes.

One row per known kind of data project/initiative, grouped into ten families.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base

FAMILIES = (
    "acquisition-ingestion",
    "movement-migration",
    "transformation-modelling",
    "storage-platform",
    "streaming-realtime",
    "orchestration-dataops",
    "governance-security-compliance",
    "analytics-serving",
    "ml-ai-infrastructure",
    "discovery-strategy",
)

_FAMILY_CHECK = "family IN ({})".format(", ".join(f"'{family}'" for family in FAMILIES))


class ProjectArchetypeRow(Base):
    __tablename__ = "project_archetypes"
    __table_args__ = (
        CheckConstraint(_FAMILY_CHECK, name="ck_project_archetypes_family"),
        CheckConstraint("seed_tier IN (1, 2, 3)", name="ck_project_archetypes_seed_tier"),
        CheckConstraint("source IN ('seed', 'user')", name="ck_project_archetypes_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    family: Mapped[str] = mapped_column(String(40), index=True)
    summary: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    supports_greenfield: Mapped[bool] = mapped_column(Boolean, default=True)
    supports_brownfield: Mapped[bool] = mapped_column(Boolean, default=True)
    is_initiative: Mapped[bool] = mapped_column(Boolean, default=False)
    # Technology-category slugs most relevant to this archetype (soft references).
    typical_category_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    default_blueprint_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Seeding depth: 1 deep (full questionnaire/blueprint), 2 standard, 3 name+summary.
    seed_tier: Mapped[int] = mapped_column(Integer, default=2)
    position: Mapped[int] = mapped_column(Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(10), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
