"""ORM models for the security & data privacy catalogs.

Two read-only reference catalogs: data regulations (GDPR, HIPAA, ...) with their full
article/section lists stored as JSONB, and data safety practices (encryption, masking,
...) that cross-link to the regulation articles they satisfy. Nothing references these
rows by id, so delete is a plain delete — no archive seam.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base

REGULATION_CATEGORIES = ("privacy", "healthcare", "payments", "financial", "ai", "resilience")
REGIONS = ("eu", "us", "canada", "brazil", "india", "global")
STATUSES = ("in_force", "phasing_in")
UNIT_LABELS = ("article", "section", "requirement", "principle")
PRACTICE_CATEGORIES = (
    "encryption-keys",
    "deidentification",
    "access-control",
    "data-lifecycle",
    "monitoring-response",
)
COMPLEXITIES = ("low", "medium", "high")
# Vocabulary of sensitive data classes a project may hold. A regulation lists the subset
# that puts it in scope in `triggering_data_classes`; the compliance scope wizard intersects
# a project's declared classes with these. Not check-constrained (stored in a JSONB list).
DATA_CLASSES = (
    "personal_data",
    "health_data",
    "payment_card_data",
    "financial_records",
    "biometric_data",
    "children_data",
    "ai_automated_decisions",
    "critical_infrastructure_ops",
)

_CATEGORY_CHECK = "category IN ({})".format(
    ", ".join(f"'{category}'" for category in REGULATION_CATEGORIES)
)
_REGION_CHECK = "region IN ({})".format(", ".join(f"'{region}'" for region in REGIONS))
_STATUS_CHECK = "status IN ({})".format(", ".join(f"'{status}'" for status in STATUSES))
_UNIT_LABEL_CHECK = "unit_label IN ({})".format(
    ", ".join(f"'{label}'" for label in UNIT_LABELS)
)
_PRACTICE_CATEGORY_CHECK = "category IN ({})".format(
    ", ".join(f"'{category}'" for category in PRACTICE_CATEGORIES)
)
_COMPLEXITY_CHECK = "complexity IN ({})".format(
    ", ".join(f"'{complexity}'" for complexity in COMPLEXITIES)
)


class DataRegulationRow(Base):
    __tablename__ = "data_regulations"
    __table_args__ = (
        CheckConstraint(_CATEGORY_CHECK, name="ck_data_regulations_category"),
        CheckConstraint(_REGION_CHECK, name="ck_data_regulations_region"),
        CheckConstraint(_STATUS_CHECK, name="ck_data_regulations_status"),
        CheckConstraint(_UNIT_LABEL_CHECK, name="ck_data_regulations_unit_label"),
        CheckConstraint("source IN ('seed', 'user')", name="ck_data_regulations_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    full_name: Mapped[str] = mapped_column(String(300), default="")
    category: Mapped[str] = mapped_column(String(20), index=True)
    region: Mapped[str] = mapped_column(String(20), index=True)
    jurisdiction: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(20), default="in_force")
    effective_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Display string ("25 May 2018", multi-rule dates for HIPAA); effective_year stays sortable.
    effective_date: Mapped[str] = mapped_column(String(120), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    # Bulleted descriptions of impacted entities ("Controllers and processors ...").
    who_is_impacted: Mapped[list[str]] = mapped_column(JSONB, default=list)
    penalties: Mapped[str] = mapped_column(String(500), default="")
    official_url: Mapped[str] = mapped_column(String(500), default="")
    # Drives citation rendering: article→"Art.", section→"§", requirement→"Req.", ...
    unit_label: Mapped[str] = mapped_column(String(20), default="article")
    # Full unit list: [{number, title, chapter, ref, is_key, summary, key_requirements,
    # paragraphs: [{ref, text}]}]. Key units carry prose; the rest are number+title.
    articles: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    # Data classes whose presence puts this regime in scope (compliance scope wizard).
    # Values drawn from DATA_CLASSES; empty means "not triggered by a data class alone".
    triggering_data_classes: Mapped[list[str]] = mapped_column(JSONB, default=list)
    related_practice_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    related_technology_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    position: Mapped[int] = mapped_column(Integer, default=0)
    starred: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(10), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DataSafetyPracticeRow(Base):
    __tablename__ = "data_safety_practices"
    __table_args__ = (
        CheckConstraint(_PRACTICE_CATEGORY_CHECK, name="ck_data_safety_practices_category"),
        CheckConstraint(_COMPLEXITY_CHECK, name="ck_data_safety_practices_complexity"),
        CheckConstraint("source IN ('seed', 'user')", name="ck_data_safety_practices_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(30), index=True)
    # One-liner for cards.
    objective: Mapped[str] = mapped_column(String(300), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    complexity: Mapped[str] = mapped_column(String(10), default="medium")
    implementation_steps: Mapped[list[str]] = mapped_column(JSONB, default=list)
    # Regulation articles this practice helps satisfy:
    # [{regulation_slug, article_refs: [number, ...], note}].
    satisfies: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    related_technology_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    related_practice_slugs: Mapped[list[str]] = mapped_column(JSONB, default=list)
    position: Mapped[int] = mapped_column(Integer, default=0)
    starred: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(10), default="user")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
