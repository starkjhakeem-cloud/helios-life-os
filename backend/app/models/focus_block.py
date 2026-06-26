from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FocusBlock(Base):
    __tablename__ = "focus_blocks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # ISO 8601 strings, stored as String for consistency with CalendarEvent
    start_time: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    end_time: Mapped[str] = mapped_column(String(50), nullable=False)
    linked_goal_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("goals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # JSON list of task IDs assigned to this block
    linked_task_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # "planned" | "in_progress" | "completed" | "cancelled"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    # "manual" | "ai_suggested" | "calendar_sync"
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Recorded when the block transitions to in_progress / completed
    actual_start: Mapped[str | None] = mapped_column(String(50), nullable=True)
    actual_end: Mapped[str | None] = mapped_column(String(50), nullable=True)
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
