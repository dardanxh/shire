"""Pydantic input/result schemas for the data-modelling strategy catalog."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Topic = Literal["modelling", "evolution", "serialization"]
Family = Literal[
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
]
Complexity = Literal["low", "medium", "high"]
Source = Literal["seed", "user"]

# Each family belongs to exactly one topic; the service rejects mismatches so
# rows never group under the wrong browse tab.
TOPIC_BY_FAMILY: dict[str, str] = {
    "normalization": "modelling",
    "warehouse-methodologies": "modelling",
    "dimensional-schemas": "modelling",
    "nosql": "modelling",
    "specialized": "modelling",
    "slowly-changing-dimensions": "evolution",
    "compatibility": "evolution",
    "migration-patterns": "evolution",
    "text-formats": "serialization",
    "binary-row-formats": "serialization",
    "columnar-formats": "serialization",
}


class ModellingExampleTable(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class ModellingExampleSnippet(BaseModel):
    """Verbatim code/format sample (JSON, YAML, .proto, ...) rendered as a code block."""

    name: str = Field(min_length=1, max_length=120)
    code: str = ""


class ModellingExample(BaseModel):
    narrative: str = ""
    tables: list[ModellingExampleTable] = Field(default_factory=list)
    snippets: list[ModellingExampleSnippet] = Field(default_factory=list)
    decisions: list[str] = Field(default_factory=list)


class CreateModellingStrategy(BaseModel):
    slug: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=200)
    topic: Topic = "modelling"
    family: Family
    description: str = ""
    best_for: str = Field(default="", max_length=300)
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    complexity: Complexity = "medium"
    origin_year: int | None = Field(default=None, ge=1960, le=2100)
    originator: str | None = Field(default=None, max_length=200)
    example: ModellingExample | None = None
    diagram: str = ""
    related_technology_slugs: list[str] = Field(default_factory=list)
    position: int = 0


class UpdateModellingStrategy(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=160)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    topic: Topic | None = None
    family: Family | None = None
    description: str | None = None
    best_for: str | None = Field(default=None, max_length=300)
    pros: list[str] | None = None
    cons: list[str] | None = None
    complexity: Complexity | None = None
    origin_year: int | None = Field(default=None, ge=1960, le=2100)
    originator: str | None = Field(default=None, max_length=200)
    example: ModellingExample | None = None
    diagram: str | None = None
    related_technology_slugs: list[str] | None = None
    position: int | None = None


class ModellingStrategyResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    topic: Topic
    family: Family
    description: str
    best_for: str
    pros: list[str]
    cons: list[str]
    complexity: Complexity
    origin_year: int | None
    originator: str | None
    example: ModellingExample | None
    diagram: str
    related_technology_slugs: list[str]
    position: int
    source: Source
    created_at: datetime
    updated_at: datetime
