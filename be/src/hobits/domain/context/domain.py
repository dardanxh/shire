"""Context bounded-context domain: the persisted context-pack record + its persistence port.

The pack itself is a projection (its shape lives in `schemas.RepoContextResult`); what we persist is
a thin envelope — the serialized document plus a `source_hash` fingerprint that drives cache
invalidation. No SQLAlchemy here (that's `repositories.py`).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(frozen=True)
class StoredContextPack:
    """One repository's current, materialized context pack.

    `source_hash` fingerprints the inputs the pack was built from (latest analysis content + cached
    artifact state). A read recomputes the hash and reuses `document` when it still matches.
    """

    repository_id: uuid.UUID
    commit_sha: str
    source_hash: str
    document: dict[str, Any]
    generated_at: datetime
    edited_markdown: str | None = None


class ContextPackStore(Protocol):
    """Persistence port for the (single, upserted) context pack per repository."""

    def get(self, repository_id: uuid.UUID) -> StoredContextPack | None: ...
    def upsert(self, pack: StoredContextPack) -> None: ...
    def set_edited_markdown(self, repository_id: uuid.UUID, markdown: str | None) -> None: ...
