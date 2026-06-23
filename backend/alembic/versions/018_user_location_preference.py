"""add user location preference

Revision ID: 018
Revises: 017
Create Date: 2026-06-22
"""

import sqlalchemy as sa
from alembic import op

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column(
            "location",
            sa.String(length=120),
            nullable=False,
            server_default="New York",
        ),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "location")
