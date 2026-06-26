"""
Semantic memory table for HELIOS Phase 3 RAG.

Each row represents one indexed piece of user content (task, goal, calendar
event, conversation message, etc.) plus its vector embedding. Embeddings are
stored as a JSON float-array for SQLite/Postgres compatibility; in production
Postgres the 026 migration enables the pgvector extension so a proper vector
index can be added alongside this column without schema changes.

source_type values:
    task | goal | calendar_event | daily_history | daily_brief |
    assistant_message | integration_summary | note | memory
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SemanticMemory(Base):
    __tablename__ = "semantic_memories"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Which entity type produced this memory
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # ID of the source record (task.id, goal.id, etc.)
    source_id: Mapped[str] = mapped_column(String, nullable=False)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    # Full text used to generate the embedding (never contains secrets)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Shorter version for prompt injection and search result display
    content_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Float-array embedding (1536 dims for text-embedding-3-small).
    # Stored as JSON so the model works in both SQLite (tests) and Postgres.
    # The 026 migration enables pgvector; a native vector column/index can be
    # added in a future migration without changing this model.
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Arbitrary key/value metadata (source-specific fields, tags, etc.)
    extra_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # 0.0–1.0; higher = surface more prominently in ranking
    importance_score: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.5
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
    last_accessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        # One row per (user, source_type, source_id) — upsert key
        UniqueConstraint(
            "user_id", "source_type", "source_id",
            name="uq_semantic_memory_source",
        ),
        Index("ix_semantic_memories_user_id", "user_id"),
        Index("ix_semantic_memories_user_source_type", "user_id", "source_type"),
    )
