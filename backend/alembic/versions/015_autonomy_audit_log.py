"""autonomy_audit_log

Revision ID: 015
Revises: 014
Create Date: 2026-06-12

Creates the autonomy_audit_log table for V3.6 — per-user immutable audit trail
of autonomy-related decisions for safety, transparency, and debugging.
"""

import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "autonomy_audit_log",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("source", sa.String(100), nullable=False, server_default="helios"),
        sa.Column("related_queue_item_id", sa.String(), nullable=True),
        sa.Column("action_type", sa.String(100), nullable=True),
        sa.Column("risk_level", sa.String(20), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("audit_metadata", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_autonomy_audit_log_user_id", "autonomy_audit_log", ["user_id"])
    op.create_index(
        "ix_autonomy_audit_log_user_created",
        "autonomy_audit_log",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_autonomy_audit_log_user_created", table_name="autonomy_audit_log")
    op.drop_index("ix_autonomy_audit_log_user_id", table_name="autonomy_audit_log")
    op.drop_table("autonomy_audit_log")
