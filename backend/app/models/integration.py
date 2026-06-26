from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserIntegration(Base):
    __tablename__ = "user_integrations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Legacy provider identifiers include google_calendar/gmail/outlook_*.
    # New Google OAuth rows use provider="google" plus service_type.
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    # New OAuth rows use "calendar" or "gmail"; legacy rows may be NULL.
    service_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # connected | disconnected | needs_attention | syncing | error
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="disconnected")
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # JSON-encoded list of OAuth scope strings. Ready for real token scopes without a migration.
    scopes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ── OAuth token storage (populated when real OAuth is implemented) ─────────
    # Tokens are encrypted at rest via app.services.token_encryption (Fernet).
    # Neither field is ever serialised into API responses.
    access_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    # UTC timestamp when the access token expires. Exposed via API so the
    # frontend can warn before a background sync encounters a 401.
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "provider", "service_type", name="uq_user_integration_provider_service"),
    )
