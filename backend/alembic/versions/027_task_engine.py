"""task_engine

Revision ID: 027
Revises: 026
Create Date: 2026-06-25

Phase 3 — Task Engine:
  - tasks: source, source_id, source_metadata
  - new table: task_suggestions
"""

import sqlalchemy as sa
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("source", sa.String(50), nullable=False, server_default="manual"))
        batch_op.add_column(sa.Column("source_id", sa.String(300), nullable=True))
        batch_op.add_column(sa.Column("source_metadata", sa.JSON(), nullable=True))
        batch_op.create_index("ix_tasks_source_id", ["source_id"])
    op.alter_column("tasks", "source", server_default=None)

    op.create_table(
        "task_suggestions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("priority", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("due_date", sa.String(50), nullable=True),
        sa.Column("estimated_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("source_type", sa.String(50), nullable=False),
        sa.Column("source_id", sa.String(300), nullable=True),
        sa.Column("source_metadata", sa.JSON(), nullable=True),
        sa.Column("linked_goal_id", sa.String(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("accepted_task_id", sa.String(), nullable=True),
        sa.Column("rejected_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["linked_goal_id"], ["goals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["accepted_task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("user_id", "source_type", "source_id", "title", name="uq_task_suggestion_source_title"),
    )
    op.create_index("ix_task_suggestions_user_id", "task_suggestions", ["user_id"])
    op.create_index("ix_task_suggestions_linked_goal_id", "task_suggestions", ["linked_goal_id"])
    op.create_index("ix_task_suggestions_accepted_task_id", "task_suggestions", ["accepted_task_id"])
    op.create_index("ix_task_suggestions_user_status", "task_suggestions", ["user_id", "status"])
    op.create_index("ix_task_suggestions_user_source", "task_suggestions", ["user_id", "source_type", "source_id"])


def downgrade() -> None:
    op.drop_index("ix_task_suggestions_user_source", table_name="task_suggestions")
    op.drop_index("ix_task_suggestions_user_status", table_name="task_suggestions")
    op.drop_index("ix_task_suggestions_accepted_task_id", table_name="task_suggestions")
    op.drop_index("ix_task_suggestions_linked_goal_id", table_name="task_suggestions")
    op.drop_index("ix_task_suggestions_user_id", table_name="task_suggestions")
    op.drop_table("task_suggestions")

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_index("ix_tasks_source_id")
        batch_op.drop_column("source_metadata")
        batch_op.drop_column("source_id")
        batch_op.drop_column("source")
