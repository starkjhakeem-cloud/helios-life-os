from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
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

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
