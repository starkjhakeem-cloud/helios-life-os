"""
Semantic Memory Service — HELIOS Phase 3 RAG

Indexes user data into the semantic_memories table and provides
meaning-based search across all indexed content.

Ranking combines:
  - semantic similarity  (55%)  cosine distance of embeddings
  - keyword bonus        (15%)  direct word overlap with query
  - recency bonus        (15%)  decays linearly from 1.0 today → 0.0 at 30 days
  - importance score     (10%)  stored per-memory importance (0–1)
  - source type bonus     (5%)  relevance of source type to context type

When embeddings are unavailable (no API key, API failure), the service
falls back to keyword + recency + importance ranking automatically.
Callers never need to handle the embedding-unavailable case explicitly.

Security:
  - All queries are scoped to user_id
  - Raw secrets must never appear in indexed content (EmbeddingService checks)
  - No embedding is ever returned to callers (only title/summary/metadata)
"""

from __future__ import annotations

import logging
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.conversation import ConversationMessage
from app.models.daily_history import DailyHistory
from app.models.focus_block import FocusBlock
from app.models.goal import Goal
from app.models.memory import AIMemory
from app.models.semantic_memory import SemanticMemory
from app.models.task import Task
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

# Ranking weights (must sum to 1.0)
_W_SEMANTIC   = 0.55
_W_KEYWORD    = 0.15
_W_RECENCY    = 0.15
_W_IMPORTANCE = 0.10
_W_TYPE       = 0.05

# Recency decay period in days (score drops to 0 after this)
_RECENCY_DAYS = 30

# Source type → priority for each context type
# Values: 1.0 = highly relevant, 0.5 = somewhat relevant, 0.2 = low relevance
_SOURCE_TYPE_RELEVANCE: dict[str, dict[str, float]] = {
    "general":         {"memory": 0.9, "goal": 0.8, "task": 0.7, "daily_history": 0.6, "calendar_event": 0.5, "assistant_message": 0.4, "daily_brief": 0.5},
    "goals":           {"goal": 1.0, "task": 0.7, "memory": 0.8, "daily_brief": 0.5, "calendar_event": 0.4, "daily_history": 0.4, "assistant_message": 0.3},
    "tasks":           {"task": 1.0, "goal": 0.7, "focus_block": 0.6, "memory": 0.6, "daily_history": 0.5, "calendar_event": 0.4, "assistant_message": 0.3},
    "calendar":        {"calendar_event": 1.0, "daily_history": 0.7, "task": 0.5, "goal": 0.4, "memory": 0.4, "assistant_message": 0.2},
    "school":          {"goal": 0.9, "task": 0.9, "memory": 0.8, "daily_history": 0.6, "calendar_event": 0.5, "assistant_message": 0.5},
    "work":            {"goal": 0.8, "task": 0.9, "memory": 0.7, "calendar_event": 0.6, "daily_history": 0.5, "assistant_message": 0.4},
    "health":          {"goal": 0.8, "memory": 0.7, "task": 0.6, "daily_history": 0.5, "calendar_event": 0.4, "assistant_message": 0.3},
    "finance":         {"goal": 0.8, "memory": 0.7, "task": 0.6, "daily_history": 0.5, "assistant_message": 0.3},
    "historical":      {"daily_history": 1.0, "daily_brief": 0.8, "task": 0.5, "goal": 0.4, "memory": 0.4, "assistant_message": 0.5},
    "email":           {"assistant_message": 0.6, "memory": 0.5, "task": 0.4, "goal": 0.3},
    "creative":        {"goal": 0.7, "task": 0.7, "memory": 0.8, "assistant_message": 0.5, "daily_history": 0.4},
    "helios_development": {"goal": 0.8, "task": 0.9, "memory": 0.7, "daily_history": 0.6, "assistant_message": 0.5},
}
_DEFAULT_SOURCE_RELEVANCE: dict[str, float] = {
    "memory": 0.7, "goal": 0.7, "task": 0.6, "daily_history": 0.5,
    "calendar_event": 0.4, "assistant_message": 0.3, "daily_brief": 0.4,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two float vectors."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot  = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def _recency_bonus(dt: datetime) -> float:
    """1.0 for today, decays linearly to 0.0 at _RECENCY_DAYS days old."""
    if not dt:
        return 0.0
    days_old = max(0.0, (_now() - dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else _now() - dt).total_seconds() / 86400)
    return max(0.0, 1.0 - days_old / _RECENCY_DAYS)


def _keyword_bonus(query_text: str, content: str) -> float:
    """Fraction of query words that appear in content (capped at 1.0)."""
    query_words = set(re.findall(r"\w+", query_text.lower()))
    if not query_words:
        return 0.0
    content_lower = content.lower()
    hits = sum(1 for w in query_words if w in content_lower)
    return min(hits / len(query_words), 1.0)


def _source_type_bonus(source_type: str, context_type: str | None) -> float:
    """Lookup source-type relevance for the current context type."""
    relevance_map = _SOURCE_TYPE_RELEVANCE.get(
        context_type or "general",
        _DEFAULT_SOURCE_RELEVANCE,
    )
    return relevance_map.get(source_type, 0.3)


def _truncate(text: str, max_len: int = 200) -> str:
    text = text.strip()
    return text[:max_len] if len(text) <= max_len else text[:max_len - 1] + "…"


def _sanitize_value(value: Any, emb: EmbeddingService) -> Any:
    if isinstance(value, str):
        return emb.redact_secrets(value)
    if isinstance(value, list):
        return [_sanitize_value(item, emb) for item in value]
    if isinstance(value, dict):
        return {str(key): _sanitize_value(item, emb) for key, item in value.items()}
    return value


# ── Service ────────────────────────────────────────────────────────────────────

class SemanticMemoryService:
    """
    Index and search user content semantically.

    Pass a custom EmbeddingService for testing (mock provider).
    """

    def __init__(
        self,
        db: Session,
        embedding_svc: EmbeddingService | None = None,
    ) -> None:
        self.db = db
        self.emb = embedding_svc or EmbeddingService()

    # ── Indexing ────────────────────────────────────────────────────────────

    def index_task(self, task: Task) -> SemanticMemory | None:
        if not task or not task.title:
            return None

        goal_title: str | None = None
        if task.linked_goal_id:
            g = self.db.execute(
                select(Goal).where(Goal.id == task.linked_goal_id)
            ).scalar_one_or_none()
            if g:
                goal_title = g.title

        content_parts = [f"Task: {task.title}.", f"Status: {task.status}.", f"Priority: {task.priority}."]
        if task.due_date:
            content_parts.append(f"Due: {task.due_date}.")
        if goal_title:
            content_parts.append(f"Goal: {goal_title}.")
        if task.category:
            content_parts.append(f"Category: {task.category}.")
        if task.description:
            content_parts.append(f"Notes: {task.description[:500]}.")
        content = " ".join(content_parts)

        importance = 0.5
        if task.priority in ("high", "critical"):
            importance += 0.2
        if task.status == "in_progress":
            importance += 0.1
        if task.linked_goal_id:
            importance += 0.1
        importance = min(importance, 0.95)

        return self.upsert_memory(
            user_id        = task.user_id,
            source_type    = "task",
            source_id      = task.id,
            title          = task.title,
            content        = content,
            content_summary= _truncate(content, 180),
            metadata       = {"status": task.status, "priority": task.priority, "due_date": task.due_date},
            importance_score = importance,
        )

    def index_goal(self, goal: Goal) -> SemanticMemory | None:
        if not goal or not goal.title:
            return None

        content_parts = [f"Goal: {goal.title}.", f"Status: {goal.status}."]
        if getattr(goal, "priority", None):
            content_parts.append(f"Priority: {goal.priority}.")
        if getattr(goal, "target_date", None):
            content_parts.append(f"Target date: {goal.target_date}.")
        if getattr(goal, "description", None):
            content_parts.append(f"Description: {goal.description[:500]}.")
        content = " ".join(content_parts)

        importance = 0.7
        if getattr(goal, "priority", None) in ("high", "critical"):
            importance += 0.2
        importance = min(importance, 0.95)

        return self.upsert_memory(
            user_id        = goal.user_id,
            source_type    = "goal",
            source_id      = goal.id,
            title          = goal.title,
            content        = content,
            content_summary= _truncate(content, 180),
            metadata       = {"status": goal.status, "priority": getattr(goal, "priority", None), "target_date": getattr(goal, "target_date", None)},
            importance_score = importance,
        )

    def index_calendar_event(self, event: CalendarEvent) -> SemanticMemory | None:
        if not event or not event.title:
            return None

        from datetime import date as _date
        today_str = _date.today().isoformat()

        content_parts = [f"Event: {event.title}."]
        if event.start_time:
            content_parts.append(f"Date: {event.start_time[:16].replace('T', ' ')}.")
        if event.end_time:
            content_parts.append(f"End: {event.end_time[:16].replace('T', ' ')}.")
        if event.location:
            content_parts.append(f"Location: {event.location}.")
        if event.event_type:
            content_parts.append(f"Type: {event.event_type}.")
        if event.source:
            content_parts.append(f"Source: {event.source}.")
        content = " ".join(content_parts)

        is_today = bool(event.start_time and event.start_time[:10] == today_str)
        importance = 0.5 if is_today else 0.3
        if event.linked_goal_id:
            importance += 0.1

        return self.upsert_memory(
            user_id        = event.user_id,
            source_type    = "calendar_event",
            source_id      = event.id,
            title          = event.title,
            content        = content,
            content_summary= _truncate(content, 180),
            metadata       = {"start_time": event.start_time, "event_type": event.event_type, "source": event.source},
            importance_score = importance,
        )

    def index_daily_history(self, history: DailyHistory) -> SemanticMemory | None:
        if not history:
            return None

        from datetime import date as _date
        today_str = _date.today().isoformat()

        date_str = str(history.history_date) if history.history_date else "unknown date"
        title    = f"Daily history: {date_str}"

        content_parts = [f"{date_str}:"]
        if history.summary:
            content_parts.append(history.summary[:600])

        completed = history.completed_tasks or []
        if completed:
            task_titles = [t.get("title", "") for t in completed[:5] if isinstance(t, dict)]
            if task_titles:
                content_parts.append(f"Completed: {', '.join(task_titles)}.")

        goals_snap = history.goals_snapshot or []
        if goals_snap:
            goal_titles = [g.get("title", "") for g in goals_snap[:3] if isinstance(g, dict)]
            if goal_titles:
                content_parts.append(f"Goals: {', '.join(goal_titles)}.")

        if history.notes:
            content_parts.append(f"Notes: {history.notes[:300]}.")
        content = " ".join(content_parts)

        is_today = date_str == today_str
        importance = 0.5 if is_today else max(0.2, 0.4 - 0.02 * (
            (_date.today() - history.history_date).days
            if history.history_date else 10
        ))

        return self.upsert_memory(
            user_id        = history.user_id,
            source_type    = "daily_history",
            source_id      = history.id,
            title          = title,
            content        = content,
            content_summary= _truncate(history.summary or content, 180),
            metadata       = {"date": date_str, "completed_count": len(completed)},
            importance_score = importance,
        )

    def index_daily_brief(self, history: DailyHistory) -> SemanticMemory | None:
        """Index the daily_brief JSON blob from a DailyHistory record."""
        if not history or not history.daily_brief:
            return None

        brief = history.daily_brief
        date_str = str(history.history_date) if history.history_date else "unknown"
        title    = f"Daily brief: {date_str}"

        content_parts = [f"Brief for {date_str}."]
        if isinstance(brief, dict):
            if brief.get("summary"):
                content_parts.append(str(brief["summary"])[:400])
            for p in (brief.get("priorities") or [])[:5]:
                if isinstance(p, dict):
                    content_parts.append(f"{p.get('label', '')}: {p.get('detail', '')[:100]}")
                elif isinstance(p, str):
                    content_parts.append(p[:100])
        content = " ".join(content_parts)

        return self.upsert_memory(
            user_id        = history.user_id,
            source_type    = "daily_brief",
            source_id      = f"brief_{history.id}",
            title          = title,
            content        = content,
            content_summary= _truncate(content, 180),
            metadata       = {"date": date_str},
            importance_score = 0.5,
        )

    def index_assistant_message(self, message: ConversationMessage) -> SemanticMemory | None:
        """Index a conversation message. User messages rank higher than assistant."""
        if not message or not message.content:
            return None
        if len(message.content.strip()) < 10:
            return None

        is_user = message.role == "user"
        prefix  = "User said" if is_user else "HELIOS said"
        content = f"{prefix}: {message.content[:800]}"
        title   = _truncate(f"{prefix}: {message.content}", 120)

        return self.upsert_memory(
            user_id        = message.user_id,
            source_type    = "assistant_message",
            source_id      = message.id,
            title          = title,
            content        = content,
            content_summary= _truncate(message.content, 150),
            metadata       = {"role": message.role},
            importance_score = 0.45 if is_user else 0.25,
        )

    def index_ai_memory(self, memory: AIMemory) -> SemanticMemory | None:
        """Index explicit AI memories — these get highest base importance."""
        if not memory or not memory.content:
            return None

        content = f"User memory [{memory.memory_type}]: {memory.content}"
        if memory.extra_data and isinstance(memory.extra_data, dict):
            tags = memory.extra_data.get("tags") or []
            if tags:
                content += f" Tags: {', '.join(str(t) for t in tags[:5])}."

        return self.upsert_memory(
            user_id        = memory.user_id,
            source_type    = "memory",
            source_id      = memory.id,
            title          = _truncate(memory.content, 120),
            content        = content,
            content_summary= _truncate(memory.content, 180),
            metadata       = {"memory_type": memory.memory_type},
            importance_score = 0.8,
        )

    # ── Core upsert ─────────────────────────────────────────────────────────

    def upsert_memory(
        self,
        user_id: str,
        source_type: str,
        source_id: str,
        title: str,
        content: str,
        *,
        content_summary: str | None = None,
        metadata: dict | None = None,
        importance_score: float = 0.5,
    ) -> SemanticMemory | None:
        """
        Insert or update a semantic memory row.

        Generates an embedding only when the content actually changed.
        Returns the SemanticMemory row, or None on any unrecoverable error.
        """
        if not content or not content.strip():
            return None

        now = _now()
        safe_content = self.emb.normalize_text_for_embedding(content)
        if not safe_content:
            return None
        safe_title = _truncate(self.emb.redact_secrets(title), 500)
        safe_summary = (
            _truncate(self.emb.redact_secrets(content_summary), 500)
            if content_summary
            else _truncate(safe_content, 180)
        )
        safe_metadata = _sanitize_value(metadata or {}, self.emb)

        existing = self.db.execute(
            select(SemanticMemory).where(
                SemanticMemory.user_id     == user_id,
                SemanticMemory.source_type == source_type,
                SemanticMemory.source_id   == source_id,
            )
        ).scalar_one_or_none()

        content_changed = (existing is None) or (existing.content != safe_content)
        embedding: list[float] | None = None

        if content_changed:
            embedding = self.emb.generate_embedding(safe_content)
        elif existing:
            embedding = existing.embedding  # keep the existing vector

        if existing:
            existing.title           = safe_title
            existing.content         = safe_content
            existing.content_summary = safe_summary
            existing.embedding       = embedding
            existing.extra_metadata  = safe_metadata
            existing.importance_score= importance_score
            existing.updated_at      = now
            self._store_pgvector_embedding(existing.id, embedding)
            self.db.commit()
            self.db.refresh(existing)
            return existing

        mem = SemanticMemory(
            id              = str(uuid.uuid4()),
            user_id         = user_id,
            source_type     = source_type,
            source_id       = source_id,
            title           = safe_title,
            content         = safe_content,
            content_summary = safe_summary,
            embedding       = embedding,
            extra_metadata  = safe_metadata,
            importance_score= importance_score,
            created_at      = now,
            updated_at      = now,
        )
        self.db.add(mem)
        self.db.flush()
        self._store_pgvector_embedding(mem.id, embedding)
        self.db.commit()
        self.db.refresh(mem)
        return mem

    def _store_pgvector_embedding(self, memory_id: str, embedding: list[float] | None) -> None:
        """
        Mirror the JSON embedding into the native pgvector column when running
        on PostgreSQL. SQLite tests ignore this path.
        """
        if self.db.bind is None or self.db.bind.dialect.name != "postgresql":
            return
        try:
            with self.db.begin_nested():
                if embedding:
                    vector_literal = "[" + ",".join(f"{float(value):.9g}" for value in embedding) + "]"
                    self.db.execute(
                        text(
                            "UPDATE semantic_memories "
                            "SET embedding_vector = CAST(:embedding AS vector) "
                            "WHERE id = :memory_id"
                        ),
                        {"embedding": vector_literal, "memory_id": memory_id},
                    )
                else:
                    self.db.execute(
                        text("UPDATE semantic_memories SET embedding_vector = NULL WHERE id = :memory_id"),
                        {"memory_id": memory_id},
                    )
        except Exception:
            logger.warning("SemanticMemoryService: pgvector mirror update failed; JSON embedding retained.")

    def semantic_search(
        self,
        user_id: str,
        query: str,
        limit: int = 10,
        filters: dict | None = None,
        context_type: str | None = None,
    ) -> dict[str, Any]:
        return self.search(
            user_id=user_id,
            query=query,
            limit=limit,
            filters=filters,
            context_type=context_type,
        )

    # ── Deletion ─────────────────────────────────────────────────────────────

    def delete_memory(self, user_id: str, source_type: str, source_id: str) -> bool:
        """Delete a semantic memory by source. Returns True if found."""
        row = self.db.execute(
            select(SemanticMemory).where(
                SemanticMemory.user_id     == user_id,
                SemanticMemory.source_type == source_type,
                SemanticMemory.source_id   == source_id,
            )
        ).scalar_one_or_none()
        if not row:
            return False
        self.db.delete(row)
        self.db.commit()
        return True

    # ── Reindex ─────────────────────────────────────────────────────────────

    def reindex_user(self, user_id: str) -> dict[str, Any]:
        """
        Reindex all content for a user from scratch.

        Iterates tasks, goals, calendar events, daily history records, and
        AI memories. Returns a stats dict: {indexed, failed, total}.
        """
        indexed = 0
        failed  = 0

        def _safe_index(fn, entity):
            nonlocal indexed, failed
            try:
                result = fn(entity)
                if result:
                    indexed += 1
                else:
                    failed += 1
            except Exception as exc:
                failed += 1
                logger.warning("reindex_user: failed indexing %s — %s", fn.__name__, exc)

        tasks = self.db.execute(
            select(Task).where(Task.user_id == user_id)
        ).scalars().all()
        for t in tasks:
            _safe_index(self.index_task, t)

        goals = self.db.execute(
            select(Goal).where(Goal.user_id == user_id)
        ).scalars().all()
        for g in goals:
            _safe_index(self.index_goal, g)

        events = self.db.execute(
            select(CalendarEvent).where(CalendarEvent.user_id == user_id)
        ).scalars().all()
        for ev in events:
            _safe_index(self.index_calendar_event, ev)

        histories = self.db.execute(
            select(DailyHistory).where(DailyHistory.user_id == user_id)
        ).scalars().all()
        for h in histories:
            _safe_index(self.index_daily_history, h)
            _safe_index(self.index_daily_brief, h)

        memories = self.db.execute(
            select(AIMemory).where(AIMemory.user_id == user_id)
        ).scalars().all()
        for m in memories:
            _safe_index(self.index_ai_memory, m)

        # Recent conversation messages (user messages only for privacy)
        messages = self.db.execute(
            select(ConversationMessage)
            .where(
                ConversationMessage.user_id == user_id,
                ConversationMessage.role    == "user",
            )
            .order_by(ConversationMessage.created_at.desc())
            .limit(50)
        ).scalars().all()
        for msg in messages:
            _safe_index(self.index_assistant_message, msg)

        total = indexed + failed
        logger.info(
            "reindex_user: user=%s indexed=%d failed=%d total=%d",
            user_id, indexed, failed, total,
        )
        return {"indexed": indexed, "failed": failed, "total": total, "embedding_available": self.emb.available}

    # ── Search ──────────────────────────────────────────────────────────────

    def search(
        self,
        user_id: str,
        query: str,
        limit: int = 10,
        filters: dict | None = None,
        context_type: str | None = None,
    ) -> dict[str, Any]:
        """
        Semantic search across this user's indexed memories.

        When embeddings are available:
          1. Generate query embedding.
          2. Compute cosine similarity against all stored embeddings.
          3. Apply combined ranking: similarity + keyword + recency + importance.

        When embeddings are unavailable (no API key, API failure):
          Falls back to keyword + recency + importance ranking.

        Returns:
          {
            "query": "...",
            "embedding_used": bool,
            "results": [
              {
                "source_type": "goal",
                "source_id": "...",
                "title": "...",
                "content_summary": "...",
                "score": 0.91,
                "metadata": {}
              }
            ]
          }
        """
        if not query or not query.strip():
            return {"query": query, "embedding_used": False, "results": []}

        # Build base DB query
        stmt = select(SemanticMemory).where(SemanticMemory.user_id == user_id)

        if filters and filters.get("source_type"):
            stmt = stmt.where(SemanticMemory.source_type == filters["source_type"])

        memories: list[SemanticMemory] = self.db.execute(stmt).scalars().all()

        if not memories:
            return {"query": query, "embedding_used": False, "results": []}

        # Attempt to get a query embedding
        query_embedding: list[float] | None = self.emb.generate_embedding(query)
        embedding_used = query_embedding is not None

        # Score every memory
        scored: list[dict[str, Any]] = []
        for mem in memories:
            # 1. Semantic similarity
            sim = 0.0
            if embedding_used and mem.embedding:
                sim = _cosine_similarity(query_embedding, mem.embedding)  # type: ignore[arg-type]

            # 2. Keyword bonus
            kw = _keyword_bonus(query, mem.content or "")

            # 3. Recency bonus
            rec = _recency_bonus(mem.updated_at)

            # 4. Importance
            imp = mem.importance_score or 0.5

            # 5. Source type bonus
            st = _source_type_bonus(mem.source_type, context_type)

            final = (
                _W_SEMANTIC   * sim  +
                _W_KEYWORD    * kw   +
                _W_RECENCY    * rec  +
                _W_IMPORTANCE * imp  +
                _W_TYPE       * st
            )

            scored.append({
                "source_type":     mem.source_type,
                "source_id":       mem.source_id,
                "title":           mem.title,
                "content_summary": mem.content_summary or _truncate(mem.content, 150),
                "score":           round(final, 4),
                "metadata":        mem.extra_metadata or {},
                "_mem_id":         mem.id,  # internal; stripped below
            })

        # Sort descending by score; take top-N
        scored.sort(key=lambda x: x["score"], reverse=True)
        top = scored[:limit]

        # Touch last_accessed_at for top results (fire-and-forget)
        if top:
            ids_to_touch = [r["_mem_id"] for r in top]
            now = _now()
            for mem in memories:
                if mem.id in ids_to_touch:
                    mem.last_accessed_at = now
            try:
                self.db.commit()
            except Exception:
                self.db.rollback()

        # Strip internal field before returning
        for r in top:
            r.pop("_mem_id", None)

        return {
            "query":          query,
            "embedding_used": embedding_used,
            "results":        top,
        }
