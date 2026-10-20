"""ORM model for the MCP servers the host runner's `claude` CLI can reach (a probe snapshot)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base

MCP_STATUSES = ("connected", "needs_auth", "failed", "unknown")


class McpServerRow(Base):
    __tablename__ = "mcp_servers"
    __table_args__ = (
        CheckConstraint(
            "status IN ('connected', 'needs_auth', 'failed', 'unknown')",
            name="ck_mcp_servers_status",
        ),
    )

    # The CLI's display name ("claude.ai PPRO Atlassian") — unique per CLI config.
    name: Mapped[str] = mapped_column(String(200), primary_key=True)
    target: Mapped[str] = mapped_column(String(2048), default="")
    status: Mapped[str] = mapped_column(String(20), default="unknown")
    status_detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Full `mcp__server__tool` names; kept from the last probe that could enumerate them.
    tools: Mapped[list[str]] = mapped_column(JSONB, default=list)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
