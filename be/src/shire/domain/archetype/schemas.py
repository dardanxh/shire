"""Pydantic input/result schemas for the archetype catalog."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Family = Literal[
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
]
Kind = Literal["greenfield", "brownfield"]
Source = Literal["seed", "user"]


class CreateArchetype(BaseModel):
    slug: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=200)
    family: Family
    summary: str = Field(default="", max_length=500)
    description: str = ""
    supports_greenfield: bool = True
    supports_brownfield: bool = True
    is_initiative: bool = False
    typical_category_slugs: list[str] = Field(default_factory=list)
    default_blueprint_slugs: list[str] = Field(default_factory=list)
    seed_tier: int = Field(default=2, ge=1, le=3)
    position: int = 0


class UpdateArchetype(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=160)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    family: Family | None = None
    summary: str | None = Field(default=None, max_length=500)
    description: str | None = None
    supports_greenfield: bool | None = None
    supports_brownfield: bool | None = None
    is_initiative: bool | None = None
    typical_category_slugs: list[str] | None = None
    default_blueprint_slugs: list[str] | None = None
    seed_tier: int | None = Field(default=None, ge=1, le=3)
    position: int | None = None
    archived: bool | None = None


class ArchetypeResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    family: Family
    summary: str
    description: str
    supports_greenfield: bool
    supports_brownfield: bool
    is_initiative: bool
    typical_category_slugs: list[str]
    default_blueprint_slugs: list[str]
    seed_tier: int
    position: int
    archived: bool
    source: Source
    created_at: datetime
    updated_at: datetime
