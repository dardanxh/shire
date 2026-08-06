"""prompt_versions: record which suggestion a merged body came from

Two corrections to the prompts schema, both about telling the truth:

- `prompt_versions.from_suggestion_id` closes the loop. A suggestion already points at the version
  it was generated *from*; without the reverse pointer there is no way to ask "did accepting the
  model's rewrite actually raise the score?", which is the question the module exists to answer.
  FK-less on purpose (same call as `prompt_judgements.winner_run_id`) -- the two tables already
  reference each other, and a plain pointer keeps the delete order simple.
- `prompt_suggestions.edits` -> `changes`. The column holds the model's narrative notes on what it
  changed, not an applicable patch set; accept/reject units come from a deterministic diff of the
  old and new bodies. "edits" implied patches and would have misled the next reader.

Revision ID: a0b1c2d3e4f5
Revises: f9a0b1c2d3e4
Create Date: 2026-08-06 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a0b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "f9a0b1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "prompt_versions", sa.Column("from_suggestion_id", sa.Uuid(), nullable=True)
    )
    op.alter_column("prompt_suggestions", "edits", new_column_name="changes")


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("prompt_suggestions", "changes", new_column_name="edits")
    op.drop_column("prompt_versions", "from_suggestion_id")
