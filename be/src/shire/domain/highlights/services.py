"""Business logic for highlights."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from shire.core.exceptions import NotFoundError, ValidationError
from shire.core.pagination import Page, PaginationParams
from shire.domain.highlights.models import HighlightRow
from shire.domain.highlights.repositories import SqlHighlightRepository
from shire.domain.highlights.schemas import CreateHighlight, HighlightResult

_WHITESPACE = re.compile(r"\s+")


class HighlightService:
    """Constructed per request from a DB session."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._highlights = SqlHighlightRepository(session)

    def create(self, data: CreateHighlight) -> HighlightResult:
        """Keep one passage. A browser selection carries the source document's line breaks and
        indentation, which read as ragged quotes in the list — collapse them to single spaces."""
        text = _WHITESPACE.sub(" ", data.text).strip()
        if not text:
            raise ValidationError("A highlight cannot be blank")
        row = HighlightRow(
            text=text,
            source_kind=data.source_kind,
            source_id=data.source_id,
            source_label=data.source_label,
            repository_id=data.repository_id,
            created_at=datetime.now(UTC),
        )
        self._highlights.add(row)
        return HighlightResult.of(row)

    def list(self, params: PaginationParams) -> Page[HighlightResult]:
        rows = self._highlights.list(limit=params.limit, offset=params.offset)
        return Page.create(
            [HighlightResult.of(row) for row in rows], self._highlights.count(), params
        )

    def delete(self, highlight_id: uuid.UUID) -> None:
        self._require(highlight_id)
        self._highlights.delete(highlight_id)

    def _require(self, highlight_id: uuid.UUID) -> HighlightRow:
        row = self._highlights.get(highlight_id)
        if row is None:
            raise NotFoundError("Highlight not found")
        return row
