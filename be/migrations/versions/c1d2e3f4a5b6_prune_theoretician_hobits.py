"""hobits module: prune removed theoretician hobits' assignments and config overrides

The roster was rebuilt around the knowledge catalogs (architecture + quality experts); the 22
hand-written theoreticians are gone. Their repo assignments and config overrides are deleted so
stale rows can't shadow same-slug catalog experts (scalability, idempotency, data-quality) or
leave dead schedules. Run history and briefing items are append-only and stay. If the Prefect
scheduler is enabled, stale deployments for removed assignments are reconciled by the next
schedule sync (locally the scheduler is off by default).

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-07-27 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = "b0c1d2e3f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REMOVED_SLUGS = (
    "streaming",
    "data-modeling",
    "lakehouse",
    "idempotency",
    "backfill",
    "data-quality",
    "data-governance",
    "data-privacy",
    "data-observability",
    "dataops",
    "metadata",
    "data-mesh",
    "data-product",
    "data-ingestion",
    "scalability",
    "cost",
    "security",
    "code-quality",
    "testing",
    "tech-debt",
    "dependency-strategy",
    "performance",
)


def upgrade() -> None:
    """Upgrade schema."""
    slugs = sa.bindparam("slugs", value=list(_REMOVED_SLUGS), expanding=True)
    op.get_bind().execute(
        sa.text("DELETE FROM repository_hobits WHERE hobit_slug IN :slugs").bindparams(slugs)
    )
    op.get_bind().execute(
        sa.text("DELETE FROM hobit_configs WHERE slug IN :slugs").bindparams(slugs)
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Data-only cleanup; the deleted assignment/override rows are not restorable.
