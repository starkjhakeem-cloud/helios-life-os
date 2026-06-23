"""create user_profiles table

Revision ID: 019
Revises: 018
Create Date: 2026-06-22
"""

import sqlalchemy as sa
from alembic import op

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_profiles",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("custom_user_id", sa.String(length=24), nullable=True),
        # False = post-setup change slot still available
        # True  = the one allowed change has been used; field is locked
        sa.Column("user_id_changed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("user_id_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_name", sa.String(length=100), nullable=True),
        sa.Column("last_name", sa.String(length=100), nullable=True),
        sa.Column("display_name", sa.String(length=200), nullable=True),
        sa.Column("phone_number", sa.String(length=30), nullable=True),
        sa.Column("date_of_birth", sa.String(length=10), nullable=True),
        sa.Column("address_line_1", sa.String(length=200), nullable=True),
        sa.Column("address_line_2", sa.String(length=200), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("timezone", sa.String(length=60), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
        sa.UniqueConstraint("custom_user_id", name="uq_user_profiles_custom_user_id"),
    )
    op.create_index(
        "ix_user_profiles_custom_user_id",
        "user_profiles",
        ["custom_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_profiles_custom_user_id", table_name="user_profiles")
    op.drop_table("user_profiles")
