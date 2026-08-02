"""SQLAlchemy ORM entity for the Repository aggregate."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class RepositoryRow(Base):
    __tablename__ = "repositories"
    __table_args__ = (
        UniqueConstraint("provider", "owner", "name", "subpath", name="uq_repo_coordinates"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    owner: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    # Monorepo focus: analysis is scoped to this subdirectory of the clone ('' = whole repo).
    # Part of the natural key so the same repo can be onboarded once per subdirectory.
    # Empty string (not NULL) because Postgres treats NULLs as distinct in unique constraints.
    subpath: Mapped[str] = mapped_column(String(512), default="", server_default="")
    url: Mapped[str] = mapped_column(String(1024))
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("connections.id", ondelete="SET NULL"), nullable=True
    )
    default_branch: Mapped[str] = mapped_column(String(255), default="main")
    # The branch the clone is checked out on; NULL rows fall back to default_branch.
    current_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    clone_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(32))
    # Watchlist: repos the user follows for the daily "what changed" digest.
    watched: Mapped[bool] = mapped_column(default=False, server_default="false")
    # Digest cursor: the snapshot commit the user last reviewed. The digest shows the delta
    # from here to the latest snapshot; "mark reviewed" advances it. A sha (not analysis id)
    # because re-analyzing the same commit replaces the snapshot row and its id.
    last_reviewed_commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Where the cursor sat before the last "mark reviewed" — lets an up-to-date card still
    # show (collapsed) the window that was just reviewed instead of losing it.
    prev_reviewed_commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_analyzed_commit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    @property
    def analysis_path(self) -> str | None:
        """`clone_path` scoped to `subpath` (monorepo focus) — mirrors the domain aggregate's
        `Repository.analysis_path` for services that read the row directly."""
        if self.clone_path is None:
            return None
        return f"{self.clone_path.rstrip('/')}/{self.subpath}" if self.subpath else self.clone_path
