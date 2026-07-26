"""ORM model for saved Capacity Planner calculations.

Only the named inputs are persisted — all sizing math is recomputed client-side from
them, exactly like the live calculator (single source of truth for the formulas).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from shire.core.db import Base


class CapacityCalculationRow(Base):
    __tablename__ = "capacity_calculations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160))
    inputs: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
