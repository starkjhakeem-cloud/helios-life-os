"""daily_history

Revision ID: 023
Revises: 022
Create Date: 2026-06-24

Creates durable per-user, per-date day history records for the Calendar Life
Timeline and future Assistant context retrieval.
"""

import sqlalchemy as sa
from alembic import op

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_history",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(100), nullable=False),
        sa.Column("day_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("daily_brief", sa.JSON(), nullable=True),
        sa.Column("completed_tasks", sa.JSON(), nullable=False),
        sa.Column("planned_tasks", sa.JSON(), nullable=False),
        sa.Column("overdue_tasks", sa.JSON(), nullable=False),
        sa.Column("goals_snapshot", sa.JSON(), nullable=False),
        sa.Column("calendar_events", sa.JSON(), nullable=False),
        sa.Column("focus_blocks", sa.JSON(), nullable=False),
        sa.Column("assistant_activity", sa.JSON(), nullable=False),
        sa.Column("integration_activity", sa.JSON(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_history_user_date"),
    )
    op.create_index("ix_daily_history_user_id", "daily_history", ["user_id"])
    op.create_index("ix_daily_history_date", "daily_history", ["date"])
    op.create_index("ix_daily_history_user_date_range", "daily_history", ["user_id", "date"])


def downgrade() -> None:
    op.drop_index("ix_daily_history_user_date_range", table_name="daily_history")
    op.drop_index("ix_daily_history_date", table_name="daily_history")
    op.drop_index("ix_daily_history_user_id", table_name="daily_history")
    op.drop_table("daily_history")
