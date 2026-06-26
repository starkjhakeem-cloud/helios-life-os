"""google_real_integrations

Revision ID: 022
Revises: 021
Create Date: 2026-06-24

Adds service-specific Google connected account fields and normalized sync
metadata for Calendar/Gmail read-only integrations.
"""

import sqlalchemy as sa
from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_integrations") as batch_op:
        batch_op.add_column(sa.Column("service_type", sa.String(30), nullable=True))
        batch_op.add_column(sa.Column("email", sa.String(320), nullable=True))
        batch_op.add_column(sa.Column("display_name", sa.String(200), nullable=True))
        batch_op.drop_constraint("uq_user_integration_provider", type_="unique")
        batch_op.create_unique_constraint(
            "uq_user_integration_provider_service",
            ["user_id", "provider", "service_type"],
        )

    with op.batch_alter_table("sync_jobs") as batch_op:
        batch_op.add_column(sa.Column("service_type", sa.String(30), nullable=True))
        batch_op.add_column(sa.Column("records_skipped", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("error_message", sa.Text(), nullable=True))

    with op.batch_alter_table("calendar_events") as batch_op:
        batch_op.add_column(sa.Column("calendar_id", sa.String(300), nullable=True))
        batch_op.add_column(sa.Column("timezone", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("attendees", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("source_account_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("raw_metadata", sa.JSON(), nullable=True))
        batch_op.create_foreign_key(
            "fk_calendar_events_source_account_id_user_integrations",
            "user_integrations",
            ["source_account_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_calendar_events_source_account_id", ["source_account_id"])

    with op.batch_alter_table("email_messages") as batch_op:
        batch_op.add_column(sa.Column("thread_id", sa.String(300), nullable=True))
        batch_op.add_column(sa.Column("recipients", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("labels", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("has_attachments", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("source_account_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("raw_metadata", sa.JSON(), nullable=True))
        batch_op.create_foreign_key(
            "fk_email_messages_source_account_id_user_integrations",
            "user_integrations",
            ["source_account_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_email_messages_source_account_id", ["source_account_id"])

    op.create_table(
        "integration_oauth_states",
        sa.Column("state", sa.String(200), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("service_type", sa.String(30), nullable=False),
        sa.Column("scopes", sa.Text(), nullable=False),
        sa.Column("redirect_uri", sa.String(500), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("state"),
    )
    op.create_index("ix_integration_oauth_states_user_id", "integration_oauth_states", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_integration_oauth_states_user_id", table_name="integration_oauth_states")
    op.drop_table("integration_oauth_states")

    with op.batch_alter_table("email_messages") as batch_op:
        batch_op.drop_index("ix_email_messages_source_account_id")
        batch_op.drop_constraint("fk_email_messages_source_account_id_user_integrations", type_="foreignkey")
        batch_op.drop_column("raw_metadata")
        batch_op.drop_column("source_account_id")
        batch_op.drop_column("has_attachments")
        batch_op.drop_column("labels")
        batch_op.drop_column("recipients")
        batch_op.drop_column("thread_id")

    with op.batch_alter_table("calendar_events") as batch_op:
        batch_op.drop_index("ix_calendar_events_source_account_id")
        batch_op.drop_constraint("fk_calendar_events_source_account_id_user_integrations", type_="foreignkey")
        batch_op.drop_column("raw_metadata")
        batch_op.drop_column("source_account_id")
        batch_op.drop_column("attendees")
        batch_op.drop_column("timezone")
        batch_op.drop_column("calendar_id")

    with op.batch_alter_table("sync_jobs") as batch_op:
        batch_op.drop_column("error_message")
        batch_op.drop_column("records_skipped")
        batch_op.drop_column("service_type")

    with op.batch_alter_table("user_integrations") as batch_op:
        batch_op.drop_constraint("uq_user_integration_provider_service", type_="unique")
        batch_op.create_unique_constraint("uq_user_integration_provider", ["user_id", "provider"])
        batch_op.drop_column("display_name")
        batch_op.drop_column("email")
        batch_op.drop_column("service_type")
