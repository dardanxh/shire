"""Pydantic result schemas for the Briefing domain."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class BriefingItemResult(BaseModel):
    """One post in the briefing feed — authored by a hobit, about a repository."""

    id: uuid.UUID
    repository_id: uuid.UUID
    repository_slug: str
    hobit_run_id: uuid.UUID
    hobit_slug: str
    tier: str
    headline: str
    importance: int
    confidence: int
    urgency: int
    created_at: datetime
    read_at: datetime | None
