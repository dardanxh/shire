"""hobit feedback cycle

Revision ID: b7d4f2a9c3e1
Revises: a1c2e3d4f5a6
Create Date: 2026-07-19 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d4f2a9c3e1'
down_revision: Union[str, Sequence[str], None] = 'a1c2e3d4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """User feedback on hobit runs (one row per run) + per-hobit distilled guidance."""
    op.create_table(
        'hobit_run_feedback',
        sa.Column('run_id', sa.Uuid(), nullable=False),
        sa.Column('hobit_slug', sa.String(length=64), nullable=False),
        sa.Column('repository_slug', sa.String(length=512), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('run_id'),
        sa.ForeignKeyConstraint(['run_id'], ['hobit_runs.id'], ondelete='CASCADE'),
        sa.CheckConstraint('rating >= 1 AND rating <= 5', name='ck_feedback_rating_range'),
    )
    op.create_index(
        'ix_hobit_run_feedback_hobit_slug', 'hobit_run_feedback', ['hobit_slug']
    )
    op.create_table(
        'hobit_guidance',
        sa.Column('hobit_slug', sa.String(length=64), nullable=False),
        sa.Column('guidance', sa.Text(), nullable=True),
        sa.Column('last_distilled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('feedback_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('distill_enqueued_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('hobit_slug'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('hobit_guidance')
    op.drop_index('ix_hobit_run_feedback_hobit_slug', table_name='hobit_run_feedback')
    op.drop_table('hobit_run_feedback')
