"""add assistant_name_preference to user_preferences

Revision ID: 029
Revises: 028
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "assistant_name_preference",
            sa.String(20),
            nullable=True,
            server_default="display_name",
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "assistant_name_preference")
