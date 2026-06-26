from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DailyHistory(Base):
    __tablename__ = "daily_history"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_daily_history_user_date"),
        Index("ix_daily_history_user_date_range", "user_id", "date"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    history_date: Mapped[date] = mapped_column("date", Date, nullable=False, index=True)
    timezone: Mapped[str] = mapped_column(String(100), nullable=False, default="UTC")
    day_type: Mapped[str] = mapped_column(String(20), nullable=False, default="today")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    daily_brief: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    completed_tasks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    planned_tasks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    overdue_tasks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    goals_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    calendar_events: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    focus_blocks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    assistant_activity: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    integration_activity: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
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
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
