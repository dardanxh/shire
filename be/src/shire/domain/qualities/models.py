"""ORM model for the architecture-qualities catalog.

One read-only catalog of non-functional data-architecture qualities (scalability, fault
tolerance, restartability, ...). Each quality carries its "how it's achieved" mechanisms
and, as a JSONB list, how it manifests in specific architecture blueprints (soft slug
references — the blueprint domain is not modified). Nothing references qualities by id, so
delete is a plain delete — no archive seam.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base

QUALITY_CATEGORIES = (
    "performance",
    "reliability",
    "recovery",
    "data-integrity",
    "operability",
)
# Manifestation ratings live inside the JSONB list, so they're validated by Pydantic
# (Literal), not a DB CHECK — mirrors how security validates nested article fields.
QUALITY_RATINGS = ("strong", "moderate", "limited", "trade-off")

_CATEGORY_CHECK = "category IN ({})".format(
    ", ".join(f"'{category}'" for category in QUALITY_CATEGORIES)
)


class ArchitectureQualityRow(Base):
    __tablename__ = "architecture_qualities"
    __table_args__ = (
        CheckConstraint(_CATEGORY_CHECK, name="ck_architecture_qualities_category"),
        CheckConstraint(
            "source IN ('seed', 'user')", name="ck_architecture_qualities_source"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(30), index=True)
    # One-liner for cards.
    summary: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # "How it's achieved": [{name, note, related_technology_slugs}].
    mechanisms: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    # How this quality manifests per architecture: [{blueprint_slug, rating, statement}].
    manifestations: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    # What you give up to achieve this quality: [{title, note, quality_slug?}].
    tradeoffs: Mapped[list[dict]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    related_technology_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Trade-off tensions with other qualities (e.g. consistency <-> availability).
    related_quality_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    position: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(10), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
