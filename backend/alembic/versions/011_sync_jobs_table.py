"""sync_jobs_table

Revision ID: 011
Revises: 010
Create Date: 2026-06-11

Creates the sync_jobs table to track per-integration sync history.

Architecture note: status transitions ("running" → "completed"/"failed") are
designed for future async sync workers — they just update the row rather than
creating a new one. The errors column stores a JSON-encoded list so multiple
error messages can be captured from a single sync run.

Fields:
  - id                  TEXT PRIMARY KEY (UUID)
  - user_id             TEXT NOT NULL, FK → users(id) ON DELETE CASCADE
  - integration_id      TEXT NOT NULL, FK → user_integrations(id) ON DELETE CASCADE
  - provider            VARCHAR(50) NOT NULL
  - status              VARCHAR(30) NOT NULL  (running|completed|failed)
  - started_at          TIMESTAMPTZ NOT NULL
  - completed_at        TIMESTAMPTZ nullable
  - records_processed   INTEGER NOT NULL DEFAULT 0
  - records_created     INTEGER NOT NULL DEFAULT 0
  - records_updated     INTEGER NOT NULL DEFAULT 0
  - errors              TEXT nullable (JSON-encoded list of error strings)
"""

import sqlalchemy as sa
from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sync_jobs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("integration_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("records_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_created", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("records_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["integration_id"], ["user_integrations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_jobs_user_id", "sync_jobs", ["user_id"])
    op.create_index("ix_sync_jobs_integration_id", "sync_jobs", ["integration_id"])


def downgrade() -> None:
    op.drop_index("ix_sync_jobs_integration_id", table_name="sync_jobs")
    op.drop_index("ix_sync_jobs_user_id", table_name="sync_jobs")
    op.drop_table("sync_jobs")
