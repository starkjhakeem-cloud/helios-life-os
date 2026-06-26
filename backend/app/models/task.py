from datetime import datetime, timezone

from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="todo")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    due_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    linked_goal_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("goals.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Relationship extension fields
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    scheduled_start: Mapped[str | None] = mapped_column(String(50), nullable=True)
    scheduled_end: Mapped[str | None] = mapped_column(String(50), nullable=True)
    focus_block_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("focus_blocks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Task Engine provenance fields.
    # source examples: "manual" | "gmail" | "calendar" | "goal" | "daily_brief"
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    source_id: Mapped[str | None] = mapped_column(String(300), nullable=True, index=True)
    source_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
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
