"""integrations_table

Revision ID: 010
Revises: 009
Create Date: 2026-06-11

Creates the user_integrations table for tracking external provider connections.

Architecture note: the scopes column stores a JSON-encoded list of OAuth scope
strings so real token credentials can be added (as a new column) when OAuth is
implemented, without requiring a schema redesign.

Fields:
  - id              TEXT PRIMARY KEY (UUID)
  - user_id         TEXT NOT NULL, FK → users(id) ON DELETE CASCADE
  - provider        VARCHAR(50) NOT NULL
  - status          VARCHAR(30) NOT NULL DEFAULT 'disconnected'
  - connected_at    TIMESTAMPTZ nullable
  - last_sync_at    TIMESTAMPTZ nullable
  - scopes          TEXT nullable (JSON-encoded list of OAuth scope strings)
  - created_at      TIMESTAMPTZ NOT NULL
  - updated_at      TIMESTAMPTZ NOT NULL

Unique: (user_id, provider) — one row per user per provider
"""

import sqlalchemy as sa
from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_integrations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="disconnected"),
        sa.Column("connected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scopes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "provider", name="uq_user_integration_provider"),
    )
    op.create_index("ix_user_integrations_user_id", "user_integrations", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_integrations_user_id", table_name="user_integrations")
    op.drop_table("user_integrations")
