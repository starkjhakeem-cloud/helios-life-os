"""integration_token_fields

Revision ID: 012
Revises: 011
Create Date: 2026-06-11

Add encrypted token storage columns and token_expires_at to user_integrations.
All columns are nullable so existing rows are unaffected.
Tokens are encrypted at rest via app.services.token_encryption (Fernet).
"""

import sqlalchemy as sa
from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_integrations",
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "user_integrations",
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=True),
    )
    op.add_column(
        "user_integrations",
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_integrations", "token_expires_at")
    op.drop_column("user_integrations", "refresh_token_encrypted")
    op.drop_column("user_integrations", "access_token_encrypted")
