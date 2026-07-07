"""Imports every ORM model so `Base.metadata` is fully populated (for Alembic autogenerate)."""

from __future__ import annotations

import hobits.domain  # noqa: F401  (eager-imports every domain's models.py)
from hobits.core.db import Base

__all__ = ["Base"]
