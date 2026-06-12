from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AutonomyQueueItem(Base):
    __tablename__ = "autonomy_queue"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_agent: Mapped[str] = mapped_column(String(100), nullable=False)
    proposed_action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_preview: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    # "low" | "medium" | "high"
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="low")
    # "pending" | "approved" | "rejected" | "completed"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
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
