"""Pydantic schemas for highlights."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from shire.domain.highlights.models import HighlightRow


class CreateHighlight(BaseModel):
    """Keep a selected passage. The client supplies where it was reading."""

    text: str = Field(min_length=1, max_length=10_000)
    source_kind: str = Field(min_length=1, max_length=64)
    source_id: uuid.UUID | None = None
    source_label: str = Field(min_length=1, max_length=300)
    repository_id: uuid.UUID | None = None


class HighlightResult(BaseModel):
    """One kept passage, with the pointer the UI turns back into a link."""

    id: uuid.UUID
    text: str
    source_kind: str
    source_id: uuid.UUID | None
    source_label: str
    repository_id: uuid.UUID | None
    created_at: datetime

    @classmethod
    def of(cls, row: HighlightRow) -> HighlightResult:
        return cls(
            id=row.id,
            text=row.text,
            source_kind=row.source_kind,
            source_id=row.source_id,
            source_label=row.source_label,
            repository_id=row.repository_id,
            created_at=row.created_at,
        )
