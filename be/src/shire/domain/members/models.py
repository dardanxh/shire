"""ORM model for member exclusions (opt-out / bot filtering).

The only persisted state in this context. Everything else is derived on demand from the
substrate's contributor data. A row hides a matching identity from every members view —
used for bots and for people who ask not to be measured.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from shire.core.db import Base


class MemberExclusionRow(Base):
    __tablename__ = "member_exclusions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # A glob matched (case-insensitively) against the member's email and display name,
    # e.g. "*[bot]*" or "someone@example.com".
    pattern: Mapped[str] = mapped_column(String(320), unique=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
