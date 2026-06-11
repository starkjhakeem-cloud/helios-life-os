"""email_messages_table

Revision ID: 009
Revises: 008
Create Date: 2026-06-11

"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_messages",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("sender", sa.String(300), nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("snippet", sa.Text(), nullable=True),
        sa.Column("received_at", sa.String(50), nullable=False),
        sa.Column("importance", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(20), nullable=False, server_default="unread"),
        sa.Column("source", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("external_message_id", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_messages_user_id", "email_messages", ["user_id"])
    op.create_index("ix_email_messages_received_at", "email_messages", ["received_at"])
    op.create_index("ix_email_messages_status", "email_messages", ["status"])


def downgrade() -> None:
    op.drop_index("ix_email_messages_status", table_name="email_messages")
    op.drop_index("ix_email_messages_received_at", table_name="email_messages")
    op.drop_index("ix_email_messages_user_id", table_name="email_messages")
    op.drop_table("email_messages")
