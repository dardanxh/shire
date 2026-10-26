"""ai actions

Revision ID: a1c3e5f7b9d2
Revises: b96770a6fc42
Create Date: 2026-10-26 10:00:00.000000

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a1c3e5f7b9d2'
down_revision: Union[str, Sequence[str], None] = 'b96770a6fc42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The starter set: the D&A team's report skills (~/.claude/skills). Seeded once, here rather than
# in shire-seed, so an action the user deletes stays deleted. Manual until scheduled in the UI.
# Shell on: the skills shell out for `date` and the repo list (`git remote`).
_SEED_ACTIONS = (
    ("GitHub PRs — last 7 days", "/dx-github-prs"),
    ("Airflow alerts — #bi-app-airflow2-prod", "/dx-slack-alerts"),
    ("BigQuery access tickets", "/dx-bq-access-tickets"),
    ("#help-data-analytics-questions — last 24h", "/dx-help-data-analytics-questions"),
)


def upgrade() -> None:
    """Upgrade schema."""
    ai_actions = op.create_table('ai_actions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('prompt', sa.Text(), nullable=False),
    sa.Column('model', sa.String(length=64), nullable=True),
    sa.Column('schedule', sa.String(length=200), nullable=False),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('allow_shell', sa.Boolean(), nullable=False),
    sa.Column('timeout_seconds', sa.Integer(), nullable=False),
    sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_job_id', sa.Uuid(), nullable=True),
    sa.Column('last_status', sa.String(length=16), nullable=True),
    sa.Column('last_trigger', sa.String(length=16), nullable=True),
    sa.Column('last_queued_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_duration_seconds', sa.Float(), nullable=True),
    sa.Column('last_usage', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('last_error', sa.Text(), nullable=True),
    sa.Column('last_report_html', sa.Text(), nullable=True),
    sa.Column('last_report_format', sa.String(length=8), nullable=True),
    sa.Column('last_report_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("last_status IS NULL OR last_status IN ('pending', 'succeeded', 'failed')", name='ck_ai_actions_last_status'),
    sa.CheckConstraint("last_trigger IS NULL OR last_trigger IN ('manual', 'schedule')", name='ck_ai_actions_last_trigger'),
    sa.CheckConstraint("last_report_format IS NULL OR last_report_format IN ('html', 'text')", name='ck_ai_actions_last_report_format'),
    sa.ForeignKeyConstraint(['last_job_id'], ['jobs.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_ai_actions_next_run_at', 'ai_actions', ['next_run_at'], unique=False)

    now = datetime.now(UTC)
    op.bulk_insert(ai_actions, [
        {
            'id': uuid.uuid4(), 'title': title, 'prompt': prompt, 'model': 'sonnet',
            'schedule': 'manual', 'timezone': 'Europe/Berlin', 'enabled': True,
            'allow_shell': True, 'timeout_seconds': 1200, 'next_run_at': None,
            'created_at': now, 'updated_at': now,
        }
        for title, prompt in _SEED_ACTIONS
    ])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_ai_actions_next_run_at', table_name='ai_actions')
    op.drop_table('ai_actions')
