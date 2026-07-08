"""connections module: credential store + repositories.connection_id

Revision ID: b1c2d3e4f5a6
Revises: 8f6596f52b90
Create Date: 2026-07-08 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: str | Sequence[str] | None = "8f6596f52b90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("auth_method", sa.String(length=16), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("secret_encrypted", sa.String(), nullable=False),
        sa.Column("base_url", sa.String(length=1024), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_connection_name"),
    )
    op.add_column("repositories", sa.Column("connection_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_repositories_connection_id",
        "repositories",
        "connections",
        ["connection_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_repositories_connection_id", "repositories", type_="foreignkey")
    op.drop_column("repositories", "connection_id")
    op.drop_table("connections")
