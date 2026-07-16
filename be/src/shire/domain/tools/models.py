"""ORM model for the persisted tools catalog.

This table is a *projection of the local environment* — each tool's availability + version, probed
by shelling out to the binary. It's a read-through cache refreshed by the tools sync, not
user-managed data, so there's no rich domain aggregate: rows map straight to the API result.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class ToolRow(Base):
    __tablename__ = "tools"

    # Natural key: the tool's stable slug (e.g. "scc", "osv-scanner"). One row per tool.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    available: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str | None] = mapped_column(String(255), nullable=True)
    purpose: Mapped[str] = mapped_column(Text)
    install: Mapped[str] = mapped_column(String(512))
    homepage: Mapped[str] = mapped_column(String(512))
    category: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(32))
    language: Mapped[str] = mapped_column(String(32))
    position: Mapped[int] = mapped_column(Integer, default=0)  # preserves probe/display order
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
