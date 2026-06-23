"""add personalization columns to user_preferences

Revision ID: 020
Revises: 019
Create Date: 2026-06-22
"""

import sqlalchemy as sa
from alembic import op

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("preferred_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "assistant_tone",
            sa.String(length=20),
            nullable=False,
            server_default="balanced",
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column("primary_location", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("work_focus", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "daily_brief_time",
            sa.String(length=5),
            nullable=False,
            server_default="08:00",
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "time_format",
            sa.String(length=3),
            nullable=False,
            server_default="12h",
        ),
    )
    op.add_column(
        "user_preferences",
        sa.Column("important_life_areas", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "important_life_areas")
    op.drop_column("user_preferences", "time_format")
    op.drop_column("user_preferences", "daily_brief_time")
    op.drop_column("user_preferences", "work_focus")
    op.drop_column("user_preferences", "primary_location")
    op.drop_column("user_preferences", "assistant_tone")
    op.drop_column("user_preferences", "preferred_name")
