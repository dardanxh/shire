"""activity log: one row per user-meaningful event, backing the Home feed

Creates `activity_log` and backfills it from the sources the feed used to derive from
(jobs minus internal fan-out/scheduled kinds, repository onboardings, analysis refreshes,
council convenes, merge reviews), so the feed shows history from before the table existed.

Revision ID: a8b9c0d1e2f3
Revises: b6c7d8e9f0a1
Create Date: 2026-07-29 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a8b9c0d1e2f3"
down_revision: str | Sequence[str] | None = "b6c7d8e9f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Keep in sync with shire.domain.activity.services.HIDDEN_JOB_KINDS.
_HIDDEN_JOB_KINDS = (
    "council.roster",
    "council.take_r1",
    "council.take_r2",
    "council.chair",
    "mr.classification",
    "mr.overview",
    "mr.hobit_review",
    "hobit.feedback_distill",
    "news.poll",
    "news.recommend",
    "roadmap.drift",
)


def upgrade() -> None:
    op.create_table(
        "activity_log",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("repository_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["repository_id"], ["repositories.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_log_created_at", "activity_log", ["created_at"])
    op.create_index("ix_activity_log_entity_id", "activity_log", ["entity_id"])
    op.create_index("ix_activity_log_repository_id", "activity_log", ["repository_id"])

    hidden = ", ".join(f"'{kind}'" for kind in _HIDDEN_JOB_KINDS)
    op.execute(
        f"""
        INSERT INTO activity_log (id, kind, title, entity_id, repository_id, created_at)
        SELECT gen_random_uuid(), kind, left(title, 500), id, repository_id, created_at
        FROM jobs WHERE kind NOT IN ({hidden})
        """
    )
    op.execute(
        """
        INSERT INTO activity_log (id, kind, title, entity_id, repository_id, created_at)
        SELECT gen_random_uuid(), 'repository.onboarded', left(owner || '/' || name, 500),
               id, id, created_at
        FROM repositories
        """
    )
    # Analyses carry no FK — join so ids of since-deleted repos become NULL, not violations.
    op.execute(
        """
        INSERT INTO activity_log (id, kind, title, entity_id, repository_id, created_at)
        SELECT gen_random_uuid(), 'repository.analyzed', left(a.commit_sha, 12),
               a.repository_id, r.id, a.analyzed_at
        FROM analyses a LEFT JOIN repositories r ON r.id = a.repository_id
        """
    )
    op.execute(
        """
        INSERT INTO activity_log (id, kind, title, entity_id, repository_id, created_at)
        SELECT gen_random_uuid(), 'council.convened', left(name, 500), id, NULL, convened_at
        FROM council_topics WHERE convened_at IS NOT NULL
        """
    )
    op.execute(
        """
        INSERT INTO activity_log (id, kind, title, entity_id, repository_id, created_at)
        SELECT gen_random_uuid(), 'merge_review.created',
               left(coalesce(title, source_branch || ' → ' || target_branch), 500),
               id, repository_id, created_at
        FROM merge_reviews
        """
    )


def downgrade() -> None:
    op.drop_index("ix_activity_log_repository_id", table_name="activity_log")
    op.drop_index("ix_activity_log_entity_id", table_name="activity_log")
    op.drop_index("ix_activity_log_created_at", table_name="activity_log")
    op.drop_table("activity_log")
