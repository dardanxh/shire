"""Pydantic input/result schemas for the technology corpus."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Maturity = Literal["emerging", "established", "legacy"]
LearningCurve = Literal["gentle", "moderate", "steep"]
TimeToWin = Literal["hours", "days", "weeks"]
CostModel = Literal["free", "usage_based", "license", "enterprise"]
CostTier = Literal["free", "low", "medium", "high"]
DeploymentModel = Literal["cloud", "on_prem", "hybrid", "embedded", "saas"]
Source = Literal["seed", "user"]


class AuthMethodField(BaseModel):
    """One input of an auth method's credential form; `secret` values are encrypted at rest
    and never returned by the API."""

    key: str = Field(min_length=1, max_length=80)
    label: str = Field(min_length=1, max_length=120)
    secret: bool = False
    required: bool = True


class AuthMethod(BaseModel):
    """An authentication method that applies to a technology (e.g. username/password,
    key pair) — the form template for saving a project credential."""

    slug: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    fields: list[AuthMethodField] = Field(default_factory=list)

    @model_validator(mode="after")
    def _unique_field_keys(self) -> AuthMethod:
        keys = [field.key for field in self.fields]
        if len(keys) != len(set(keys)):
            raise ValueError(f"Auth method '{self.slug}' has duplicate field keys.")
        return self


def _validate_unique_method_slugs(methods: list[AuthMethod] | None) -> list[AuthMethod] | None:
    if methods is not None:
        slugs = [method.slug for method in methods]
        if len(slugs) != len(set(slugs)):
            raise ValueError("Auth method slugs must be unique per technology.")
    return methods


class CreateTechCategory(BaseModel):
    slug: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=160)
    parent_id: uuid.UUID | None = None
    position: int = 0


class UpdateTechCategory(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=160)
    name: str | None = Field(default=None, min_length=1, max_length=160)
    parent_id: uuid.UUID | None = None
    position: int | None = None


class TechCategoryResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    parent_id: uuid.UUID | None
    position: int
    source: Source


class TechCategoryTreeResult(TechCategoryResult):
    """One node of the two-level tree; group nodes carry their categories as children."""

    technology_count: int
    children: list[TechCategoryTreeResult] = Field(default_factory=list)


class CreateTechnology(BaseModel):
    slug: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=200)
    category_id: uuid.UUID
    secondary_category_ids: list[uuid.UUID] = Field(default_factory=list)
    description: str = ""
    homepage_url: str | None = None
    aliases: list[str] = Field(default_factory=list)
    deployment_models: list[DeploymentModel] = Field(default_factory=list)
    oss: bool = False
    maturity: Maturity = "established"
    learning_curve: LearningCurve = "moderate"
    time_to_win: TimeToWin = "days"
    cost_model: CostModel = "free"
    cost_tier: CostTier = "free"
    auth_methods: list[AuthMethod] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    notes: str | None = None

    _unique_auth_methods = field_validator("auth_methods")(_validate_unique_method_slugs)


class UpdateTechnology(BaseModel):
    slug: str | None = Field(default=None, min_length=1, max_length=160)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category_id: uuid.UUID | None = None
    secondary_category_ids: list[uuid.UUID] | None = None
    description: str | None = None
    homepage_url: str | None = None
    aliases: list[str] | None = None
    deployment_models: list[DeploymentModel] | None = None
    oss: bool | None = None
    maturity: Maturity | None = None
    learning_curve: LearningCurve | None = None
    time_to_win: TimeToWin | None = None
    cost_model: CostModel | None = None
    cost_tier: CostTier | None = None
    auth_methods: list[AuthMethod] | None = None
    tags: list[str] | None = None
    notes: str | None = None
    starred: bool | None = None

    _unique_auth_methods = field_validator("auth_methods")(_validate_unique_method_slugs)


class TechnologyBlueprintRef(BaseModel):
    """One architecture blueprint stage that references a technology."""

    blueprint_id: uuid.UUID
    blueprint_name: str
    stage_name: str
    role: Literal["recommended", "alternative"]


class TechnologyResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    category_id: uuid.UUID
    secondary_category_ids: list[uuid.UUID]
    description: str
    homepage_url: str | None
    aliases: list[str]
    deployment_models: list[DeploymentModel]
    oss: bool
    maturity: Maturity
    learning_curve: LearningCurve
    time_to_win: TimeToWin
    cost_model: CostModel
    cost_tier: CostTier
    auth_methods: list[AuthMethod]
    tags: list[str]
    notes: str | None
    starred: bool
    source: Source
    created_at: datetime
    updated_at: datetime
