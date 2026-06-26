from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # ISO 8601 strings (e.g. "2026-06-11T10:00:00Z").
    # Stored as String so external providers can supply their own formats
    # without a migration; queried lexicographically which is correct for
    # zero-padded ISO 8601.
    start_time: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    end_time: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # "manual" = created in HELIOS; future values: "google", "outlook", "ical"
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    # Opaque ID from the external calendar provider — used for upsert on sync.
    external_event_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    calendar_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(100), nullable=True)
    attendees: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    source_account_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("user_integrations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    raw_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Relationship extension fields
    # "event" | "task_block" | "focus_block" | "milestone"
    event_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    linked_goal_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("goals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    linked_task_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
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
