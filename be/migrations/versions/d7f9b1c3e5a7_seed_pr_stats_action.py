"""seed the PR stats AI action

Revision ID: d7f9b1c3e5a7
Revises: c4e6a8b0d2f1
Create Date: 2026-10-27 16:00:00.000000

"""
import uuid
from datetime import UTC, datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7f9b1c3e5a7'
down_revision: Union[str, Sequence[str], None] = 'c4e6a8b0d2f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The review-stats split of /dx-github-prs (~/.claude/skills/dx-github-pr-stats). The window goes
# in the Run box (`30` runs `/dx-github-pr-stats 30`); a 60-day run fans out to subagents, hence
# the longer time limit. Skipped if the user already added it by hand.
_PROMPT = "/dx-github-pr-stats"


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    exists = bind.execute(
        sa.text("SELECT 1 FROM ai_actions WHERE prompt = :p"), {"p": _PROMPT}
    ).first()
    if exists:
        return
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
    op.bulk_insert(ai_actions, [{
        'id': uuid.uuid4(), 'title': 'GitHub D&A PR stats', 'prompt': _PROMPT, 'model': 'sonnet',
        'schedule': 'manual', 'timezone': 'Europe/Berlin', 'enabled': True,
        'allow_shell': True, 'timeout_seconds': 1800, 'next_run_at': None,
        'created_at': now, 'updated_at': now,
    }])


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(sa.text("DELETE FROM ai_actions WHERE prompt = :p").bindparams(p=_PROMPT))
