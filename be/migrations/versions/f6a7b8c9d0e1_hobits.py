"""hobits module: hobit config overrides + run history

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-08 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "hobit_configs",
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=True),
        sa.Column("model", sa.String(length=64), nullable=True),
        sa.Column("charter", sa.Text(), nullable=True),
        sa.Column("timeout_seconds", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("slug"),
    )
    op.create_table(
        "hobit_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("hobit_slug", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column("headline", sa.String(length=500), nullable=True),
        sa.Column("narrative", sa.Text(), nullable=True),
        sa.Column("importance", sa.Integer(), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("urgency", sa.Integer(), nullable=True),
        sa.Column("tier", sa.String(length=8), nullable=True),
        sa.Column("raw_output", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hobit_runs_repository_id", "hobit_runs", ["repository_id"])
    op.create_index("ix_hobit_runs_hobit_slug", "hobit_runs", ["hobit_slug"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_hobit_runs_hobit_slug", table_name="hobit_runs")
    op.drop_index("ix_hobit_runs_repository_id", table_name="hobit_runs")
    op.drop_table("hobit_runs")
    op.drop_table("hobit_configs")
