"""seed the Slack catch-up and saved-items AI actions

Revision ID: f3b5d7f9a1c2
Revises: e2a4c6e8f0b1
Create Date: 2026-10-29 09:00:00.000000

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3b5d7f9a1c2'
down_revision: Union[str, Sequence[str], None] = 'e2a4c6e8f0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Two more report skills from ~/.claude/skills. Both default to a 3-day window; another goes in
# the Run box (`7` runs `/dx-slack-catchup 7`). Shell on for `date`. An action the user already
# added by hand (same prompt) is left alone.
_SEED_ACTIONS = (
    ("Slack catch-up", "/dx-slack-catchup"),
    ("Slack saved items & notes to self", "/dx-slack-saved"),
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    existing = {
        row[0]
        for row in bind.execute(
            sa.text("SELECT prompt FROM ai_actions WHERE prompt IN :prompts").bindparams(
                sa.bindparam('prompts', expanding=True)
            ),
            {'prompts': [prompt for _, prompt in _SEED_ACTIONS]},
        )
    }
    now = datetime.now(UTC)
    ai_actions = sa.table(
        'ai_actions',
        sa.column('id', sa.Uuid()), sa.column('title', sa.String()), sa.column('prompt', sa.Text()),
        sa.column('model', sa.String()), sa.column('schedule', sa.String()),
        sa.column('timezone', sa.String()), sa.column('enabled', sa.Boolean()),
        sa.column('allow_shell', sa.Boolean()), sa.column('timeout_seconds', sa.Integer()),
        sa.column('next_run_at', sa.DateTime(timezone=True)),
        sa.column('created_at', sa.DateTime(timezone=True)),
        sa.column('updated_at', sa.DateTime(timezone=True)),
    )
    rows = [
        {
            'id': uuid.uuid4(), 'title': title, 'prompt': prompt, 'model': 'sonnet',
            'schedule': 'manual', 'timezone': 'Europe/Berlin', 'enabled': True,
            'allow_shell': True, 'timeout_seconds': 1200, 'next_run_at': None,
            'created_at': now, 'updated_at': now,
        }
        for title, prompt in _SEED_ACTIONS
        if prompt not in existing
    ]
    if rows:
        op.bulk_insert(ai_actions, rows)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        sa.text("DELETE FROM ai_actions WHERE prompt IN :prompts").bindparams(
            sa.bindparam('prompts', [prompt for _, prompt in _SEED_ACTIONS], expanding=True)
        )
    )
