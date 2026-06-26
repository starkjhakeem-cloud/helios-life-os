from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserProfile(Base):
    __tablename__ = "user_profiles"

    # 1-to-1 with users — user_id is both PK and FK.
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Custom user-facing handle.
    # Initial set (from null) is free — the one allowed "change" is tracked by
    # user_id_changed so it is consumed only when a non-null value is replaced.
    custom_user_id: Mapped[str | None] = mapped_column(
        String(24), nullable=True, unique=True, index=True
    )

    # False  → the post-setup change slot is still available.
    # True   → the one allowed change has been used; field is now locked.
    user_id_changed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    user_id_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Personal information
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    display_name_change_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    display_name_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    phone_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String(10), nullable=True)  # YYYY-MM-DD
    address_line_1: Mapped[str | None] = mapped_column(String(200), nullable=True)
    address_line_2: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(60), nullable=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
