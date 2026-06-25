from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyMemorySnapshot(Base):
    __tablename__ = "daily_memory_snapshots"
    __table_args__ = (
        UniqueConstraint("user_id", "snapshot_date", name="uq_daily_memory_snapshot_user_date"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    tasks_completed: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    tasks_planned: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    overdue_tasks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    active_goals: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    goal_progress: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    calendar_events: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    focus_blocks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    daily_brief: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    assistant_activity: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    connected_service_sync: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
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
