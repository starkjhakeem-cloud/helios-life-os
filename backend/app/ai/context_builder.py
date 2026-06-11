"""
Backward-compatible context API.

All context assembly has moved to context_service.py (V2.9).
These public functions are preserved so existing callers (routers, tests)
require no changes — they delegate directly to the unified engine.

The only exception is build_memory_context(), which returns just memories
(not a full scope) and is kept as a focused helper for the chat endpoint's
memory-only mode.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.context_service import ContextScope, build_context
from app.models.memory import AIMemory

_MEMORY_LIMIT = 10


def build_user_context(user_id: str, db: Session) -> str:
    """Return assistant-chat context: profile + goals + tasks + memories."""
    return build_context(ContextScope.ASSISTANT_CHAT, user_id=user_id, db=db).text


def build_briefing_context(user_id: str, db: Session) -> str:
    """Return full daily-briefing context (all eight data sources)."""
    return build_context(ContextScope.DAILY_BRIEFING, user_id=user_id, db=db).text


def build_memory_context(user_id: str, db: Session) -> str | None:
    """
    Return only long-term memories as a plain-text string, or None if the
    user has no memories. Used by the chat endpoint when the operator has
    not opted into full context mode — memories still personalise replies
    without leaking operational data the user didn't explicitly share.
    """
    memories = (
        db.execute(
            select(AIMemory)
            .where(AIMemory.user_id == user_id)
            .order_by(AIMemory.created_at.desc())
            .limit(_MEMORY_LIMIT)
        )
        .scalars()
        .all()
    )
    if not memories:
        return None
    lines = [f"LONG-TERM MEMORY ({len(memories)} entries):"]
    for m in memories:
        lines.append(f"  [{m.memory_type.upper()}] {m.content}")
    return "\n".join(lines)
