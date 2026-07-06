"""Imports every ORM model so `Base.metadata` is fully populated (for Alembic autogenerate)."""

from __future__ import annotations

from hobits.repository.infrastructure import persistence as _repository  # noqa: F401
from hobits.shared.infrastructure.db import Base
from hobits.substrate.infrastructure import persistence as _substrate  # noqa: F401

__all__ = ["Base"]
