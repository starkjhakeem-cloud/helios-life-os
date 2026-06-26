"""relationship_logic

Revision ID: 024
Revises: 023
Create Date: 2026-06-25

Introduces the Task/Goal/Calendar relationship layer:
  - New table: focus_blocks
  - tasks: estimated_duration_minutes, category, scheduled_start, scheduled_end, focus_block_id
  - goals: priority, manual_progress
  - calendar_events: event_type, linked_goal_id, linked_task_id
"""

import sqlalchemy as sa
from alembic import op

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── focus_blocks (new table) ───────────────────────────────────────────────
    op.create_table(
        "focus_blocks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("start_time", sa.String(50), nullable=False),
        sa.Column("end_time", sa.String(50), nullable=False),
        sa.Column("linked_goal_id", sa.String(), nullable=True),
        sa.Column("linked_task_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(20), nullable=False, server_default="planned"),
        sa.Column("source", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_goal_id"], ["goals.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_focus_blocks_user_id", "focus_blocks", ["user_id"])
    op.create_index("ix_focus_blocks_start_time", "focus_blocks", ["start_time"])
    op.create_index("ix_focus_blocks_linked_goal_id", "focus_blocks", ["linked_goal_id"])

    # ── tasks: add relationship fields ────────────────────────────────────────
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("estimated_duration_minutes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("category", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("scheduled_start", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("scheduled_end", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("focus_block_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_tasks_focus_block_id_focus_blocks",
            "focus_blocks",
            ["focus_block_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_tasks_focus_block_id", ["focus_block_id"])

    # ── goals: add relationship fields ────────────────────────────────────────
    with op.batch_alter_table("goals") as batch_op:
        batch_op.add_column(sa.Column("priority", sa.String(20), nullable=True))
        batch_op.add_column(sa.Column("manual_progress", sa.Float(), nullable=True))

    # ── calendar_events: add relationship fields ───────────────────────────────
    with op.batch_alter_table("calendar_events") as batch_op:
        batch_op.add_column(sa.Column("event_type", sa.String(30), nullable=True))
        batch_op.add_column(sa.Column("linked_goal_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("linked_task_id", sa.String(), nullable=True))
        batch_op.create_foreign_key(
            "fk_calendar_events_linked_goal_id_goals",
            "goals",
            ["linked_goal_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_foreign_key(
            "fk_calendar_events_linked_task_id_tasks",
            "tasks",
            ["linked_task_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_calendar_events_linked_goal_id", ["linked_goal_id"])
        batch_op.create_index("ix_calendar_events_linked_task_id", ["linked_task_id"])


def downgrade() -> None:
    with op.batch_alter_table("calendar_events") as batch_op:
        batch_op.drop_index("ix_calendar_events_linked_task_id")
        batch_op.drop_index("ix_calendar_events_linked_goal_id")
        batch_op.drop_constraint("fk_calendar_events_linked_task_id_tasks", type_="foreignkey")
        batch_op.drop_constraint("fk_calendar_events_linked_goal_id_goals", type_="foreignkey")
        batch_op.drop_column("linked_task_id")
        batch_op.drop_column("linked_goal_id")
        batch_op.drop_column("event_type")

    with op.batch_alter_table("goals") as batch_op:
        batch_op.drop_column("manual_progress")
        batch_op.drop_column("priority")

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_index("ix_tasks_focus_block_id")
        batch_op.drop_constraint("fk_tasks_focus_block_id_focus_blocks", type_="foreignkey")
        batch_op.drop_column("focus_block_id")
        batch_op.drop_column("scheduled_end")
        batch_op.drop_column("scheduled_start")
        batch_op.drop_column("category")
        batch_op.drop_column("estimated_duration_minutes")

    op.drop_index("ix_focus_blocks_linked_goal_id", "focus_blocks")
    op.drop_index("ix_focus_blocks_start_time", "focus_blocks")
    op.drop_index("ix_focus_blocks_user_id", "focus_blocks")
    op.drop_table("focus_blocks")
