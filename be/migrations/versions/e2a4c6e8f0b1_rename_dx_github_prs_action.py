"""rename the /dx-github-prs action prompt to /dx-github-open-prs

Revision ID: e2a4c6e8f0b1
Revises: d7f9b1c3e5a7
Create Date: 2026-10-27 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2a4c6e8f0b1'
down_revision: Union[str, Sequence[str], None] = 'd7f9b1c3e5a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The skill (~/.claude/skills) was renamed once the review stats moved to /dx-github-pr-stats.
# Only prompts that *are* the command (optionally with arguments) are touched, not free text
# that merely mentions it.
_RENAME = sa.text(
    "UPDATE ai_actions SET prompt = CAST(:new AS text) || substr(prompt, length(CAST(:old AS text)) + 1) "
    "WHERE prompt = CAST(:old AS text) OR prompt LIKE CAST(:old AS text) || ' %'"
)


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(_RENAME.bindparams(old='/dx-github-prs', new='/dx-github-open-prs'))


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(_RENAME.bindparams(old='/dx-github-open-prs', new='/dx-github-prs'))
