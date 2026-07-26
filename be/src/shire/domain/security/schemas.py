"""Pydantic result schemas for the security & data privacy catalogs.

Read-only catalogs this iteration: no Create*/Update* inputs — the seeder writes rows
through the repositories directly.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

RegulationCategory = Literal["privacy", "healthcare", "payments", "financial", "ai", "resilience"]
Region = Literal["eu", "us", "canada", "brazil", "india", "global"]
Status = Literal["in_force", "phasing_in"]
UnitLabel = Literal["article", "section", "requirement", "principle"]
PracticeCategory = Literal[
    "encryption-keys",
    "deidentification",
    "access-control",
    "data-lifecycle",
    "monitoring-response",
]
Complexity = Literal["low", "medium", "high"]
Source = Literal["seed", "user"]
DataClass = Literal[
    "personal_data",
    "health_data",
    "payment_card_data",
    "financial_records",
    "biometric_data",
    "children_data",
    "ai_automated_decisions",
    "critical_infrastructure_ops",
]


class RegulationParagraph(BaseModel):
    """One paragraph/sub-provision of an article ("17(1)", "164.312(a)(2)(iv)")."""

    ref: str = Field(min_length=1, max_length=60)
    text: str = ""


class RegulationArticle(BaseModel):
    number: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=300)
    # Grouping label ("Chapter III — Rights of the Data Subject"); None = flat list.
    chapter: str | None = None
    # Explicit citation override ("§ 164.312 HIPAA"); default is computed client-side
    # from the regulation's unit_label.
    ref: str | None = None
    is_key: bool = False
    summary: str = ""
    key_requirements: list[str] = Field(default_factory=list)
    paragraphs: list[RegulationParagraph] = Field(default_factory=list)


class PracticeSatisfies(BaseModel):
    """Soft reference to regulation articles a practice helps satisfy."""

    regulation_slug: str = Field(min_length=1, max_length=160)
    article_refs: list[str] = Field(default_factory=list)
    note: str = ""


class DataRegulationResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    full_name: str
    category: RegulationCategory
    region: Region
    jurisdiction: str
    status: Status
    effective_year: int | None
    effective_date: str
    description: str
    who_is_impacted: list[str]
    penalties: str
    official_url: str
    unit_label: UnitLabel
    articles: list[RegulationArticle]
    triggering_data_classes: list[DataClass]
    related_practice_slugs: list[str]
    related_technology_slugs: list[str]
    position: int
    source: Source
    created_at: datetime
    updated_at: datetime


class DataSafetyPracticeResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    category: PracticeCategory
    objective: str
    description: str
    complexity: Complexity
    implementation_steps: list[str]
    satisfies: list[PracticeSatisfies]
    related_technology_slugs: list[str]
    related_practice_slugs: list[str]
    position: int
    source: Source
    created_at: datetime
    updated_at: datetime
