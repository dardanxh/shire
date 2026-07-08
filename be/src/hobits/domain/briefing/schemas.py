"""Pydantic result schemas for the Briefing domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class BriefingItemResult(BaseModel):
    id: uuid.UUID
    repository_id: uuid.UUID
    hobit_run_id: uuid.UUID
    hobit_slug: str
    tier: str
    headline: str
    importance: int
    confidence: int
    urgency: int
    created_at: datetime


class TieredBriefingResult(BaseModel):
    """Briefing items grouped by tier — the shape the UI renders as three sections."""

    now: list[BriefingItemResult]
    daily: list[BriefingItemResult]
    weekly: list[BriefingItemResult]
