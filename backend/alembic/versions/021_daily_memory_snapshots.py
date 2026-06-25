"""daily_memory_snapshots

Revision ID: 021
Revises: 020
Create Date: 2026-06-24

Creates per-user daily memory snapshots for Calendar Life Timeline history,
assistant context, daily brief history, and future reflection features.
"""

import sqlalchemy as sa
from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_memory_snapshots",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tasks_completed", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("tasks_planned", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("overdue_tasks", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("active_goals", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("goal_progress", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("calendar_events", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("focus_blocks", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("daily_brief", sa.JSON(), nullable=True),
        sa.Column("assistant_activity", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("connected_service_sync", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "snapshot_date", name="uq_daily_memory_snapshot_user_date"),
    )
    op.create_index("ix_daily_memory_snapshots_user_id", "daily_memory_snapshots", ["user_id"])
    op.create_index("ix_daily_memory_snapshots_snapshot_date", "daily_memory_snapshots", ["snapshot_date"])
    op.create_index(
        "ix_daily_memory_snapshots_user_date",
        "daily_memory_snapshots",
        ["user_id", "snapshot_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_daily_memory_snapshots_user_date", table_name="daily_memory_snapshots")
    op.drop_index("ix_daily_memory_snapshots_snapshot_date", table_name="daily_memory_snapshots")
    op.drop_index("ix_daily_memory_snapshots_user_id", table_name="daily_memory_snapshots")
    op.drop_table("daily_memory_snapshots")
