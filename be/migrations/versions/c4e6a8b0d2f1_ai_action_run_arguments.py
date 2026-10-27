"""ai action run arguments

Revision ID: c4e6a8b0d2f1
Revises: a1c3e5f7b9d2
Create Date: 2026-10-27 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e6a8b0d2f1'
down_revision: Union[str, Sequence[str], None] = 'a1c3e5f7b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('ai_actions', sa.Column('last_arguments', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('ai_actions', 'last_arguments')
