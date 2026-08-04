"""cicd: pipeline analysis, suggestions and implement-with-AI executions

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-08-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c6d7e8f9a0b1"
down_revision: str | Sequence[str] | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "cicd_analyses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("platforms", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("config_files", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("environments", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("transitions", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("pipelines", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("branch", sa.String(length=160), nullable=False),
        sa.Column("commit_sha", sa.String(length=64), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cicd_analyses_repository_id", "cicd_analyses", ["repository_id"], unique=True
    )

    op.create_table(
        "cicd_suggestions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(length=8), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("impact", sa.String(length=8), nullable=False),
        sa.Column("effort", sa.String(length=8), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("paths", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("execution_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("source IN ('scan', 'hobit')", name="ck_cicd_suggestions_source"),
        sa.CheckConstraint(
            "status IN ('proposed', 'applied')", name="ck_cicd_suggestions_status"
        ),
        sa.CheckConstraint(
            "impact IN ('high', 'medium', 'low')", name="ck_cicd_suggestions_impact"
        ),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cicd_suggestions_repository_id", "cicd_suggestions", ["repository_id"]
    )

    op.create_table(
        "cicd_executions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("branch", sa.String(length=160), nullable=False),
        sa.Column("worktree_path", sa.String(length=500), nullable=True),
        sa.Column("base_sha", sa.String(length=64), nullable=False),
        sa.Column("commit_sha", sa.String(length=64), nullable=True),
        sa.Column("agent_summary", sa.Text(), nullable=False),
        sa.Column("changed_files", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("suggestion_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("job_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed')",
            name="ck_cicd_executions_status",
        ),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cicd_executions_repository_id", "cicd_executions", ["repository_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_cicd_executions_repository_id", table_name="cicd_executions")
    op.drop_table("cicd_executions")
    op.drop_index("ix_cicd_suggestions_repository_id", table_name="cicd_suggestions")
    op.drop_table("cicd_suggestions")
    op.drop_index("ix_cicd_analyses_repository_id", table_name="cicd_analyses")
    op.drop_table("cicd_analyses")
