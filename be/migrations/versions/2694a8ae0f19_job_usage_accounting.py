"""job usage accounting

Revision ID: 2694a8ae0f19
Revises: 16bee49b77c1
Create Date: 2026-07-15 18:17:32.111146

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2694a8ae0f19'
down_revision: Union[str, Sequence[str], None] = '16bee49b77c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # NOTE: autogenerate wanted to drop the hand-added queue indexes (they aren't in the
    # model metadata) — keep them; this migration only adds the usage column.
    op.add_column('jobs', sa.Column('usage', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('jobs', 'usage')
