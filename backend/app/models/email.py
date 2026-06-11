from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EmailMessage(Base):
    __tablename__ = "email_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender: Mapped[str] = mapped_column(String(300), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ISO 8601 string (e.g. "2026-06-11T09:30:00Z"). Stored as String so
    # external providers can supply their own formats without a migration;
    # sorted lexicographically which is correct for zero-padded ISO 8601.
    received_at: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # "low" | "normal" | "high" | "urgent"
    importance: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    # "unread" | "read" | "archived"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unread", index=True)
    # "manual" = added in HELIOS; future values: "gmail", "outlook"
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    # Opaque ID from the external mail provider — used for upsert on sync.
    external_message_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
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
