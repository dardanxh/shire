"""SQLAlchemy ORM entity for the Repository aggregate."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from hobits.core.db import Base


class RepositoryRow(Base):
    __tablename__ = "repositories"
    __table_args__ = (UniqueConstraint("provider", "owner", "name", name="uq_repo_coordinates"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32))
    owner: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(1024))
    default_branch: Mapped[str] = mapped_column(String(255), default="main")
    clone_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(32))
    last_analyzed_commit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
