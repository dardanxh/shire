"""Pydantic result schemas for the architecture-qualities catalog.

Content is read-only — the seeder writes rows through the repository directly. The
only user-editable field is `starred` (curation, not content).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

QualityCategory = Literal[
    "performance", "reliability", "recovery", "data-integrity", "operability"
]
QualityRating = Literal["strong", "moderate", "limited", "trade-off"]
Source = Literal["seed", "user"]


class QualityMechanism(BaseModel):
    """One "how it's achieved" technique (e.g. "Data partitioning", "Offset management")."""

    name: str = Field(min_length=1, max_length=160)
    note: str = ""
    related_technology_slugs: list[str] = Field(default_factory=list)


class QualityManifestation(BaseModel):
    """How a quality shows up in a specific architecture blueprint (soft slug ref)."""

    blueprint_slug: str = Field(min_length=1, max_length=160)
    rating: QualityRating
    statement: str = Field(max_length=600)


class QualityTradeoff(BaseModel):
    """What you give up to achieve this quality; `quality_slug` links a catalog quality."""

    title: str = Field(min_length=1, max_length=160)
    note: str = Field(max_length=600)
    quality_slug: str | None = Field(default=None, max_length=160)


class UpdateArchitectureQuality(BaseModel):
    """Star-only update — quality content stays seed-managed."""

    starred: bool | None = None


class ArchitectureQualityResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    category: QualityCategory
    summary: str
    description: str
    mechanisms: list[QualityMechanism]
    manifestations: list[QualityManifestation]
    tradeoffs: list[QualityTradeoff]
    related_technology_slugs: list[str]
    related_quality_slugs: list[str]
    position: int
    starred: bool
    source: Source
    created_at: datetime
    updated_at: datetime
