"""ORM models for the technology corpus.

Two-level category tree (group -> category, self-referential parent) plus technologies that
attach to one primary category and optionally to secondary categories (JSONB id list — a join
table would be overkill for a curated corpus this size).

`source` distinguishes seeded rows from user-created/edited ones: the seed CLI upserts by slug
but never touches rows marked `user`, so in-app edits survive re-seeding.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base

SOURCE_CHECK = "source IN ('seed', 'user')"


class TechCategoryRow(Base):
    __tablename__ = "tech_categories"
    __table_args__ = (CheckConstraint(SOURCE_CHECK, name="ck_tech_categories_source"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Group slugs are plain ("databases"); category slugs are group-qualified
    # ("databases/relational") — the stable keys questionnaires and blueprints scope by.
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("tech_categories.id", ondelete="RESTRICT"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(10), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class TechnologyRow(Base):
    __tablename__ = "technologies"
    __table_args__ = (
        CheckConstraint(
            "maturity IN ('emerging', 'established', 'legacy')",
            name="ck_technologies_maturity",
        ),
        CheckConstraint(SOURCE_CHECK, name="ck_technologies_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tech_categories.id", ondelete="RESTRICT"), index=True
    )
    # UUIDs as strings — JSONB has no native UUID type.
    secondary_category_ids: Mapped[list[str]] = mapped_column(JSONB, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    homepage_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    aliases: Mapped[list[str]] = mapped_column(JSONB, default=list)
    deployment_models: Mapped[list[str]] = mapped_column(JSONB, default=list)
    oss: Mapped[bool] = mapped_column(Boolean, default=False)
    # Single-user shortlist flag; becomes per-user when auth lands.
    starred: Mapped[bool] = mapped_column(Boolean, default=False)
    maturity: Mapped[str] = mapped_column(String(20), default="established")
    # Adoption profile — curated per technology in the seed corpus.
    learning_curve: Mapped[str] = mapped_column(String(20), default="moderate")
    time_to_win: Mapped[str] = mapped_column(String(20), default="days")
    cost_model: Mapped[str] = mapped_column(String(20), default="free")
    cost_tier: Mapped[str] = mapped_column(String(20), default="free")
    # [{slug, name, fields: [{key, label, secret, required}]}] — the auth methods that apply
    # to this technology; each entry is the form template for saving a project credential.
    auth_methods: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(10), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
