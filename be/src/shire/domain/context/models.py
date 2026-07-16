"""SQLAlchemy ORM entity for the context pack (one current pack per repository)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class ContextPackRow(Base):
    """The materialized, agent-ready context document for a repository.

    Keyed by `repository_id` (one row per repo, upserted). `document` is the serialized
    `RepoContextResult`; `source_hash` fingerprints the inputs so reads can skip a rebuild when
    nothing changed.
    """

    __tablename__ = "context_packs"

    repository_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("repositories.id", ondelete="CASCADE"), primary_key=True
    )
    commit_sha: Mapped[str] = mapped_column(String(64))
    source_hash: Mapped[str] = mapped_column(String(64))
    document: Mapped[dict[str, Any]] = mapped_column(JSONB)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # User-authored Markdown override. Preserved across regenerations; when present it's the
    # effective context the UI shows and the agent reads. NULL = fall back to generated Markdown.
    edited_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    # L3 "mental model" written by the Repo-Onboarding hobit. An overlay (like edited_markdown):
    # preserved across regeneration, surfaced at the top of the pack + Markdown. NULL until a run.
    narrative: Mapped[str | None] = mapped_column(Text, nullable=True)
