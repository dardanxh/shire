"""ORM model for saved Tech Chooser decisions.

Only the named inputs (category, weights, constraints — the chooser's URL state) are
persisted; ranking is recomputed client-side from the live technology corpus, exactly
like the interactive chooser (single source of truth for the scoring).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base


class TechDecisionRow(Base):
    __tablename__ = "tech_decisions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160))
    inputs: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
