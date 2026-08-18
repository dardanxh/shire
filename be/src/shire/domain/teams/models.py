"""ORM models for teams and team memberships.

A team is a named, colored group of members. A membership folds one member identity into exactly
one team (the `member_id` unique constraint enforces one-team-per-member). `member_id` is the
Members context's identity id (UUIDv5 of the normalized primary email); we keep `member_email`
alongside it so a team roster still renders a label if that identity temporarily drops out of the
current aggregate (e.g. every commit excluded).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class TeamRow(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    # Hex color used to tint the member's nodes/badges and the team's dotted hull on the graph.
    color: Mapped[str] = mapped_column(String(9))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TeamMembershipRow(Base):
    """One member identity assigned to one team. `member_id` is unique — a member joins at most
    one team; re-assigning moves them (the old row is deleted first)."""

    __tablename__ = "team_memberships"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    team_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("teams.id", ondelete="CASCADE"), index=True
    )
    member_id: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True)
    member_email: Mapped[str] = mapped_column(String(320))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
