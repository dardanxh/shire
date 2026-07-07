"""Domain package.

Eager-imports every domain's `models.py` so `Base.metadata` is fully populated for Alembic
autogenerate (imported via `hobits.core.metadata`).
"""

from __future__ import annotations

from hobits.domain.repository import models as _repository_models  # noqa: F401
from hobits.domain.substrate import models as _substrate_models  # noqa: F401
