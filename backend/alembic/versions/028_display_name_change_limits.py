"""display_name_change_limits

Revision ID: 028
Revises: 027
Create Date: 2026-06-26
"""

import sqlalchemy as sa
from alembic import op

revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.add_column(
            sa.Column(
                "display_name_change_count",
                sa.Integer(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(
            sa.Column("display_name_changed_at", sa.DateTime(timezone=True), nullable=True)
        )
    op.alter_column("user_profiles", "display_name_change_count", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("user_profiles") as batch_op:
        batch_op.drop_column("display_name_changed_at")
        batch_op.drop_column("display_name_change_count")
