"""Pydantic input/result schemas for saved capacity calculations."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CreateCapacityCalculation(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    inputs: dict[str, Any] = Field(default_factory=dict)


class CapacityCalculationResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    inputs: dict[str, Any]
    created_at: datetime
