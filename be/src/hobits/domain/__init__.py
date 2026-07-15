"""Domain package.

Eager-imports every domain's `models.py` so `Base.metadata` is fully populated for Alembic
autogenerate (imported via `hobits.core.metadata`).
"""

from __future__ import annotations

from hobits.domain.briefing import models as _briefing_models  # noqa: F401
from hobits.domain.connections import models as _connections_models  # noqa: F401
from hobits.domain.context import models as _context_models  # noqa: F401
from hobits.domain.hobits import models as _hobits_models  # noqa: F401
from hobits.domain.jobs import models as _jobs_models  # noqa: F401
from hobits.domain.members import models as _members_models  # noqa: F401
from hobits.domain.merge_review import models as _merge_review_models  # noqa: F401
from hobits.domain.principles import models as _principles_models  # noqa: F401
from hobits.domain.repository import models as _repository_models  # noqa: F401
from hobits.domain.substrate import models as _substrate_models  # noqa: F401
from hobits.domain.tools import models as _tools_models  # noqa: F401
