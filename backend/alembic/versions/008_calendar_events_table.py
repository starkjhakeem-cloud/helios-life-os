"""calendar_events_table

Revision ID: 008
Revises: 007
Create Date: 2026-06-11

Creates the calendar_events table.

Fields:
  - id              TEXT PRIMARY KEY
  - user_id         TEXT NOT NULL, FK → users(id) ON DELETE CASCADE
  - title           VARCHAR(200) NOT NULL
  - description     TEXT nullable
  - start_time      VARCHAR(50) NOT NULL (ISO 8601, indexed for range queries)
  - end_time        VARCHAR(50) NOT NULL
  - location        VARCHAR(300) nullable
  - source          VARCHAR(30) NOT NULL DEFAULT 'manual'
  - external_event_id VARCHAR(200) nullable (opaque ID from external calendar)
  - created_at      TIMESTAMPTZ NOT NULL
  - updated_at      TIMESTAMPTZ NOT NULL
"""

import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_time", sa.String(50), nullable=False),
        sa.Column("end_time", sa.String(50), nullable=False),
        sa.Column("location", sa.String(300), nullable=True),
        sa.Column("source", sa.String(30), nullable=False, server_default="manual"),
        sa.Column("external_event_id", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_calendar_events_user_id", "calendar_events", ["user_id"])
    op.create_index("ix_calendar_events_start_time", "calendar_events", ["start_time"])


def downgrade() -> None:
    op.drop_index("ix_calendar_events_start_time", table_name="calendar_events")
    op.drop_index("ix_calendar_events_user_id", table_name="calendar_events")
    op.drop_table("calendar_events")
