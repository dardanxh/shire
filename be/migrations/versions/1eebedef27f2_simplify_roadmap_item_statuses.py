"""simplify roadmap item statuses

Revision ID: 1eebedef27f2
Revises: 483a5403a609
Create Date: 2026-07-16 12:32:15.310086

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1eebedef27f2'
down_revision: Union[str, Sequence[str], None] = '483a5403a609'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Map the retired item statuses onto the minimal three (todo / in_progress / done):
    proposed was the triage gate (now items land in todo directly), in_review meant an open
    PR (now just in_progress), dropped meant closed-without-work (now done). Also flips the
    column default for fresh rows."""
    op.execute("UPDATE roadmap_items SET status = 'todo' WHERE status = 'proposed'")
    op.execute("UPDATE roadmap_items SET status = 'in_progress' WHERE status = 'in_review'")
    op.execute("UPDATE roadmap_items SET status = 'done' WHERE status = 'dropped'")
    op.alter_column("roadmap_items", "status", server_default="todo")


def downgrade() -> None:
    """Lossy by nature (the old distinctions are gone); only the default reverts."""
    op.alter_column("roadmap_items", "status", server_default="proposed")
