from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    # 1-to-1 with users — user_id is both PK and FK.
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # UI appearance — actual theme switching is applied in a future phase.
    theme_preference: Mapped[str] = mapped_column(
        String(20), nullable=False, default="system"
    )

    # Notification master switch
    notifications_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    # Reminder-specific local notifications
    reminder_notifications: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    # AI-generated alert notifications (future feature)
    ai_notifications: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # Used as the default planning_horizon_days when calling POST /ai/plan
    default_planning_horizon: Mapped[int] = mapped_column(
        Integer, nullable=False, default=7
    )

    # Human-readable location label used for contextual time and planning UI.
    location: Mapped[str] = mapped_column(
        String(120), nullable=False, default="New York"
    )

    # ── Personalization (AI context) ──────────────────────────────────────────

    # Name HELIOS uses when addressing the user in responses.
    preferred_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Tone of HELIOS assistant responses: "balanced" | "formal" | "casual" | "brief"
    assistant_tone: Mapped[str] = mapped_column(
        String(20), nullable=False, default="balanced"
    )

    # Primary city/region used for AI context (distinct from the UI location label).
    primary_location: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # User's main professional/academic focus for AI context.
    work_focus: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Preferred time for the daily brief (HH:MM, 24-hour).
    daily_brief_time: Mapped[str] = mapped_column(
        String(5), nullable=False, default="08:00"
    )

    # Display clock format: "12h" | "24h"
    time_format: Mapped[str] = mapped_column(
        String(3), nullable=False, default="12h"
    )

    # JSON array of life area strings, e.g. '["work","health","fitness"]'
    important_life_areas: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
