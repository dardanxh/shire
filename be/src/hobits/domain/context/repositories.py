"""Data access for the context pack (SQLAlchemy entity in/out, domain record in/out)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from hobits.domain.context.domain import StoredContextPack
from hobits.domain.context.models import ContextPackRow


class SqlContextPackRepository:
    """Concrete `ContextPackStore` port bound to a SQLAlchemy session."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, repository_id: uuid.UUID) -> StoredContextPack | None:
        row = self._session.get(ContextPackRow, repository_id)
        if row is None:
            return None
        return StoredContextPack(
            repository_id=row.repository_id,
            commit_sha=row.commit_sha,
            source_hash=row.source_hash,
            document=row.document,
            generated_at=row.generated_at,
            edited_markdown=row.edited_markdown,
            narrative=row.narrative,
        )

    def upsert(self, pack: StoredContextPack) -> None:
        # Writes only the generated fields; `edited_markdown` is left untouched so a user's
        # override survives regeneration (NULL on a freshly created row).
        row = self._session.get(ContextPackRow, pack.repository_id)
        if row is None:
            row = ContextPackRow(repository_id=pack.repository_id)
            self._session.add(row)
        row.commit_sha = pack.commit_sha
        row.source_hash = pack.source_hash
        row.document = pack.document
        row.generated_at = pack.generated_at

    def set_edited_markdown(self, repository_id: uuid.UUID, markdown: str | None) -> None:
        row = self._session.get(ContextPackRow, repository_id)
        if row is not None:
            row.edited_markdown = markdown

    def set_narrative(self, repository_id: uuid.UUID, narrative: str | None) -> None:
        row = self._session.get(ContextPackRow, repository_id)
        if row is not None:
            row.narrative = narrative
