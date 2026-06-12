"""autonomy_queue

Revision ID: 013
Revises: 012
Create Date: 2026-06-12

Creates the autonomy_queue table for V3.1 — the review-only action queue
where AI agents write proposed actions and operators approve or reject them.
No automatic execution is performed from this table.
"""

import sqlalchemy as sa
from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "autonomy_queue",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_agent", sa.String(100), nullable=False),
        sa.Column("proposed_action_type", sa.String(100), nullable=False),
        sa.Column("payload_preview", sa.JSON(), nullable=False),
        # "low" | "medium" | "high"
        sa.Column("risk_level", sa.String(20), nullable=False, server_default="low"),
        # "pending" | "approved" | "rejected" | "completed"
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_autonomy_queue_user_id", "autonomy_queue", ["user_id"])
    op.create_index("ix_autonomy_queue_status", "autonomy_queue", ["status"])


def downgrade() -> None:
    op.drop_index("ix_autonomy_queue_status", table_name="autonomy_queue")
    op.drop_index("ix_autonomy_queue_user_id", table_name="autonomy_queue")
    op.drop_table("autonomy_queue")
