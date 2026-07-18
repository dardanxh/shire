"""council

Revision ID: c4a1b2d3e4f5
Revises: b7d4f2a9c3e1
Create Date: 2026-07-19 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c4a1b2d3e4f5'
down_revision: Union[str, Sequence[str], None] = 'b7d4f2a9c3e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Council topics (debated by hobit rosters in rounds) + their per-round takes."""
    op.create_table(
        'council_topics',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='suggesting'),
        sa.Column('devils_advocate', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('repository_ids', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('suggested_slugs', postgresql.JSONB(), nullable=True),
        sa.Column('member_slugs', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('roster_edited', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('roster_error', sa.Text(), nullable=True),
        sa.Column('convene_id', sa.Uuid(), nullable=True),
        sa.Column('synthesis_headline', sa.String(length=500), nullable=True),
        sa.Column('synthesis_narrative', sa.Text(), nullable=True),
        sa.Column('key_disagreements', postgresql.JSONB(), nullable=True),
        sa.Column('chair_raw_output', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('convened_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'council_takes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('topic_id', sa.Uuid(), nullable=False),
        sa.Column('round', sa.Integer(), nullable=False),
        sa.Column('hobit_slug', sa.String(length=64), nullable=False),
        sa.Column('hobit_name', sa.String(length=120), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('headline', sa.String(length=500), nullable=True),
        sa.Column('narrative', sa.Text(), nullable=True),
        sa.Column('raw_output', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['topic_id'], ['council_topics.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('topic_id', 'hobit_slug', 'round'),
        sa.CheckConstraint('round IN (1, 2)', name='ck_council_take_round'),
    )
    op.create_index('ix_council_takes_topic_id', 'council_takes', ['topic_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_council_takes_topic_id', table_name='council_takes')
    op.drop_table('council_takes')
    op.drop_table('council_topics')
