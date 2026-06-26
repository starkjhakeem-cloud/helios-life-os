"""focus_block_transitions

Revision ID: 025
Revises: 024
Create Date: 2026-06-25

Adds actual_start and actual_end to focus_blocks so status transitions
(planned → in_progress → completed) can be timestamped.
"""

from alembic import op
import sqlalchemy as sa

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("focus_blocks") as batch_op:
        batch_op.add_column(sa.Column("actual_start", sa.String(50), nullable=True))
        batch_op.add_column(sa.Column("actual_end",   sa.String(50), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("focus_blocks") as batch_op:
        batch_op.drop_column("actual_end")
        batch_op.drop_column("actual_start")
