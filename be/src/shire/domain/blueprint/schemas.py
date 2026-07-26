"""Pydantic input/result schemas for blueprints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Source = Literal["seed", "user"]


class CreateBlueprintStage(BaseModel):
    # Client-supplied id keeps stage identity stable across edits so the canvas's flows,
    # positions, and any project adoption choices survive an update (see services upsert).
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=160)
    role: str = ""
    recommended_technology_id: uuid.UUID | None = None
    alternative_technology_ids: list[uuid.UUID] = Field(default_factory=list)
    rationale: str = ""
    pos_x: float | None = None
    pos_y: float | None = None
    width: float | None = None
    height: float | None = None
    custom_color: str = Field(default="", max_length=32)
    environment: str = Field(default="", max_length=16)
    owner_name: str = Field(default="", max_length=160)
    owner_email: str = Field(default="", max_length=254)


class BlueprintFlow(BaseModel):
    """A directed data-flow edge between two stages (by stage id).

    `kind` names the payload animated along the edge (file/message/batch/stream/…);
    `line_style`/`color`/`width` control how the line itself is drawn."""

    id: str = Field(min_length=1, max_length=64)
    source_stage_id: uuid.UUID
    target_stage_id: uuid.UUID
    label: str = Field(default="", max_length=160)
    kind: str = Field(default="", max_length=32)
    line_style: str = Field(default="", max_length=16)  # "" | solid | dashed | dotted
    color: str = Field(default="", max_length=32)
    width: float | None = None


class BlueprintEvolution(BaseModel):
    """An edge to an architecture this one commonly grows into."""

    to_slug: str = Field(min_length=1, max_length=160)
    reason: str = ""


class BlueprintHotSpot(BaseModel):
    """A part of the architecture that commonly bites, with its failure mode."""

    title: str = Field(min_length=1, max_length=120)
    detail: str = ""


class BlueprintDiagram(BaseModel):
    """One rendered view of the architecture. Kinds used by the UI:
    conceptual | logical | data_flow | sequence (free string for extensibility)."""

    kind: str = Field(min_length=1, max_length=32)
    mermaid: str = ""


class CreateBlueprint(BaseModel):
    slug: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=200)
    use_case: str = Field(default="", max_length=300)
    description: str = ""
    when_to_use: list[str] = Field(default_factory=list)
    when_not_to_use: list[str] = Field(default_factory=list)
    use_cases: list[str] = Field(default_factory=list)
    hot_spots: list[BlueprintHotSpot] = Field(default_factory=list)
    complexity: str = Field(default="medium", max_length=10)
    evolution: list[BlueprintEvolution] = Field(default_factory=list)
    diagrams: list[BlueprintDiagram] = Field(default_factory=list)
    family_tags: list[str] = Field(default_factory=list)
    archetype_slugs: list[str] = Field(default_factory=list)
    flows: list[BlueprintFlow] = Field(default_factory=list)
    position: int = 0
    stages: list[CreateBlueprintStage] = Field(default_factory=list)


class UpdateBlueprint(BaseModel):
    """`stages`, when provided, is upserted by id (existing ids keep their identity)."""

    slug: str | None = Field(default=None, min_length=1, max_length=160)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    use_case: str | None = Field(default=None, max_length=300)
    description: str | None = None
    when_to_use: list[str] | None = None
    when_not_to_use: list[str] | None = None
    use_cases: list[str] | None = None
    hot_spots: list[BlueprintHotSpot] | None = None
    complexity: str | None = Field(default=None, max_length=10)
    evolution: list[BlueprintEvolution] | None = None
    diagrams: list[BlueprintDiagram] | None = None
    family_tags: list[str] | None = None
    archetype_slugs: list[str] | None = None
    flows: list[BlueprintFlow] | None = None
    position: int | None = None
    stages: list[CreateBlueprintStage] | None = None


class BlueprintStageResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: int
    name: str
    role: str
    recommended_technology_id: uuid.UUID | None
    alternative_technology_ids: list[uuid.UUID]
    rationale: str
    pos_x: float | None
    pos_y: float | None
    width: float | None
    height: float | None
    custom_color: str
    environment: str
    owner_name: str
    owner_email: str


class BlueprintResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    use_case: str
    description: str
    when_to_use: list[str]
    when_not_to_use: list[str]
    use_cases: list[str]
    hot_spots: list[BlueprintHotSpot]
    complexity: str
    evolution: list[BlueprintEvolution]
    diagrams: list[BlueprintDiagram]
    family_tags: list[str]
    archetype_slugs: list[str]
    flows: list[BlueprintFlow]
    source: Source
    position: int
    stages: list[BlueprintStageResult]
    created_at: datetime
    updated_at: datetime


class CloneBlueprint(BaseModel):
    """Optional overrides when cloning a blueprint into a user architecture."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
