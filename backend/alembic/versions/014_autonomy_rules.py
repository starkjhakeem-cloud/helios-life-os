"""autonomy_rules

Revision ID: 014
Revises: 013
Create Date: 2026-06-12

Creates the autonomy_rules table for V3.5 — per-user rules that control
which action types require manual review or are blocked from execution in
the autonomy queue execution bridge.
"""

import sqlalchemy as sa
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "autonomy_rules",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Which action type this rule governs (e.g., "create_task").
        sa.Column("action_type", sa.String(100), nullable=False),
        # Optional: scoped to a specific risk level. NULL means any risk level.
        sa.Column("risk_level", sa.String(20), nullable=True),
        # True → operator must manually approve queue item before execution.
        # (All items already require 'approved' status — this surfaces the intent
        # explicitly in the UI so operators know which types are under extra scrutiny.)
        sa.Column(
            "requires_manual_approval",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        # False → execution bridge rejects this action type entirely (403).
        sa.Column(
            "allow_execution",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
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
    op.create_index("ix_autonomy_rules_user_id", "autonomy_rules", ["user_id"])
    # Composite index for fast rule lookups during execution bridge checks.
    op.create_index(
        "ix_autonomy_rules_user_action",
        "autonomy_rules",
        ["user_id", "action_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_autonomy_rules_user_action", table_name="autonomy_rules")
    op.drop_index("ix_autonomy_rules_user_id", table_name="autonomy_rules")
    op.drop_table("autonomy_rules")
