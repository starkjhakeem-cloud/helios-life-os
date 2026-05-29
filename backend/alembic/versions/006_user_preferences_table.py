"""user_preferences table

Revision ID: 006
Revises: 005
Create Date: 2026-05-28

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("theme_preference", sa.String(20), nullable=False, server_default="system"),
        sa.Column("notifications_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("reminder_notifications", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("ai_notifications", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("default_planning_horizon", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
