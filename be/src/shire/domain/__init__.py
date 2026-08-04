"""Domain package.

Eager-imports every domain's `models.py` so `Base.metadata` is fully populated for Alembic
autogenerate (imported via `shire.core.metadata`).
"""

from __future__ import annotations

from shire.domain.activity import models as _activity_models  # noqa: F401
from shire.domain.blueprint import models as _blueprint_models  # noqa: F401
from shire.domain.briefing import models as _briefing_models  # noqa: F401
from shire.domain.capacity import models as _capacity_models  # noqa: F401
from shire.domain.compliance import models as _compliance_models  # noqa: F401
from shire.domain.connections import models as _connections_models  # noqa: F401
from shire.domain.context import models as _context_models  # noqa: F401
from shire.domain.council import models as _council_models  # noqa: F401
from shire.domain.hobits import models as _hobits_models  # noqa: F401
from shire.domain.jobs import models as _jobs_models  # noqa: F401
from shire.domain.members import models as _members_models  # noqa: F401
from shire.domain.merge_review import models as _merge_review_models  # noqa: F401
from shire.domain.modelling import models as _modelling_models  # noqa: F401
from shire.domain.news import models as _news_models  # noqa: F401
from shire.domain.principles import models as _principles_models  # noqa: F401
from shire.domain.qualities import models as _qualities_models  # noqa: F401
from shire.domain.readiness import models as _readiness_models  # noqa: F401
from shire.domain.repository import models as _repository_models  # noqa: F401
from shire.domain.roadmap import models as _roadmap_models  # noqa: F401
from shire.domain.security import models as _security_models  # noqa: F401
from shire.domain.substrate import models as _substrate_models  # noqa: F401
from shire.domain.techchoice import models as _techchoice_models  # noqa: F401
from shire.domain.technology import models as _technology_models  # noqa: F401
from shire.domain.tools import models as _tools_models  # noqa: F401
from shire.domain.watchlist import models as _watchlist_models  # noqa: F401
