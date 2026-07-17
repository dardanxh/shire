"""hobit name override

Revision ID: a1c2e3d4f5a6
Revises: 1eebedef27f2
Create Date: 2026-07-17 09:40:37.218325

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c2e3d4f5a6'
down_revision: Union[str, Sequence[str], None] = '1eebedef27f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add the display-name override column (NULL = use the spec's name)."""
    op.add_column('hobit_configs', sa.Column('name', sa.String(length=120), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('hobit_configs', 'name')
