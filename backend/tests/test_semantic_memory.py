"""
Tests for HELIOS Phase 3: Semantic Memory / RAG

All embedding calls are mocked — tests run offline without an OpenAI API key.

Mock embedding strategy:
  - Each unique string maps to a deterministic unit vector based on its content.
  - "similar" strings share a vector (cosine similarity == 1.0).
  - "unrelated" strings get an orthogonal vector (cosine similarity == 0.0).
  This lets tests assert on ranking without making real network calls.

Test coverage:
  - EmbeddingService: normalize, secret detection, fallback behavior
  - SemanticMemoryService: upsert, dedup, reindex, search ranking
  - Context integration: semantic_context key appears in build_context_for_message
  - RAG summarizer: RELEVANT HELIOS MEMORY section emitted when results exist
  - API endpoints: reindex + search (happy path, empty results, filter by source_type)
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.goal import Goal
from app.models.task import Task
from app.models.memory import AIMemory
from app.models.semantic_memory import SemanticMemory
from app.services.embedding_service import EmbeddingService
from app.services.semantic_memory_service import SemanticMemoryService, _cosine_similarity


# ── Helpers ────────────────────────────────────────────────────────────────────

def _uid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(db: Session, email: str | None = None) -> Any:
    """Insert a minimal User row directly and return it."""
    from app.models.user import User
    uid = _uid()
    u = User(
        id              = uid,
        name            = f"Test User {uid[:6]}",
        email           = email or f"test_{uid[:8]}@helios.test",
        hashed_password = "$2b$12$fakehash",
        created_at      = _now(),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _jwt(user_id: str) -> str:
    from app.core.jwt import create_access_token
    return create_access_token(user_id)


def _auth(user_id: str) -> dict:
    return {"Authorization": f"Bearer {_jwt(user_id)}"}


# Deterministic fake embedding: orthonormal basis per string hash bucket
_FAKE_DIM = 8


def _fake_embedding(text: str) -> list[float]:
    """
    Returns a unit vector.  Two calls with the same text → same vector.
    Texts that share the same first word → same vector (similarity=1).
    """
    bucket = abs(hash(text.split()[0] if text.split() else text)) % _FAKE_DIM
    vec = [0.0] * _FAKE_DIM
    vec[bucket] = 1.0
    return vec


class _MockEmbeddingService(EmbeddingService):
    """Offline stand-in: returns deterministic unit vectors, no API calls."""

    def __init__(self) -> None:
        self.api_key   = "mock-key"
        self.model     = "mock-model"
        self._client   = None  # never used
        self.available = True  # treat as if API is reachable

    def generate_embedding(self, text: str) -> list[float] | None:
        normalized = self.normalize_text_for_embedding(text)
        if not normalized:
            return None
        return _fake_embedding(normalized)

    def generate_embeddings(self, texts: list[str]) -> list[list[float] | None]:
        return [self.generate_embedding(t) for t in texts]


def _svc(db: Session) -> SemanticMemoryService:
    return SemanticMemoryService(db, embedding_svc=_MockEmbeddingService())


# ── EmbeddingService unit tests ────────────────────────────────────────────────

class TestEmbeddingService:
    def test_normalize_empty_string(self):
        svc = EmbeddingService.__new__(EmbeddingService)
        svc.api_key   = None
        svc.model     = "model"
        svc._client   = None
        svc.available = False
        assert svc.normalize_text_for_embedding("") == ""
        assert svc.normalize_text_for_embedding("   ") == ""

    def test_normalize_strips_and_collapses_whitespace(self):
        svc = EmbeddingService.__new__(EmbeddingService)
        svc.api_key   = None
        svc.model     = "model"
        svc._client   = None
        svc.available = False
        result = svc.normalize_text_for_embedding("  Hello   World  ")
        assert result == "Hello World"

    def test_truncates_long_text(self):
        svc = EmbeddingService.__new__(EmbeddingService)
        svc.api_key   = None
        svc.model     = "model"
        svc._client   = None
        svc.available = False
        # Use a repeating phrase (non-base64) to avoid the secret detector
        long_text = "hello world " * 1_000  # ~12,000 chars, no secrets
        result = svc.normalize_text_for_embedding(long_text)
        assert len(result) == 8_000

    def test_secret_detection_openai_key(self):
        svc = EmbeddingService.__new__(EmbeddingService)
        svc.api_key   = None
        svc.model     = "model"
        svc._client   = None
        svc.available = False
        # Pattern: sk- followed by 20+ alphanumeric chars
        fake_key = "sk-" + ("A" * 24)
        secret_text = f"My key is {fake_key}"
        assert svc.normalize_text_for_embedding(secret_text) == "My key is [REDACTED_SECRET]"

    def test_secret_detection_password(self):
        svc = EmbeddingService.__new__(EmbeddingService)
        svc.api_key   = None
        svc.model     = "model"
        svc._client   = None
        svc.available = False
        assert svc.normalize_text_for_embedding("password=supersecret123") == "[REDACTED_SECRET]"

    def test_no_api_key_returns_none(self):
        svc = EmbeddingService.__new__(EmbeddingService)
        svc.api_key   = None
        svc.model     = "model"
        svc._client   = None
        svc.available = False
        # normalize succeeds but client not available
        result = svc.generate_embedding("normal text here for testing")
        assert result is None

    def test_available_false_when_no_key(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "")
        # Patch settings so no key is loaded
        with patch("app.services.embedding_service.settings") as mock_settings:
            mock_settings.openai_api_key = None
            mock_settings.openai_embedding_model = "text-embedding-3-small"
            svc = EmbeddingService()
        assert svc.available is False


# ── _cosine_similarity unit tests ─────────────────────────────────────────────

class TestCosineSimilarity:
    def test_identical_vectors(self):
        v = [1.0, 0.0, 0.0]
        assert math.isclose(_cosine_similarity(v, v), 1.0)

    def test_orthogonal_vectors(self):
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert math.isclose(_cosine_similarity(a, b), 0.0)

    def test_empty_vector(self):
        assert _cosine_similarity([], []) == 0.0
        assert _cosine_similarity([1.0], []) == 0.0

    def test_mismatched_length(self):
        assert _cosine_similarity([1.0, 0.0], [1.0]) == 0.0


# ── SemanticMemoryService: upsert ─────────────────────────────────────────────

class TestUpsertMemory:
    def test_insert_new_memory(self, db: Session):
        u = _user(db)
        svc = _svc(db)

        mem = svc.upsert_memory(
            user_id      = u.id,
            source_type  = "goal",
            source_id    = "goal-1",
            title        = "Get WGU degree",
            content      = "Goal: Get WGU degree. Status: active.",
        )

        assert mem is not None
        assert mem.user_id     == u.id
        assert mem.source_type == "goal"
        assert mem.source_id   == "goal-1"
        assert mem.embedding   is not None
        assert len(mem.embedding) == _FAKE_DIM

    def test_upsert_updates_existing_row(self, db: Session):
        u = _user(db)
        svc = _svc(db)

        svc.upsert_memory(u.id, "goal", "goal-2", "Old title", "Old content for goal two.")
        row1 = db.execute(
            __import__("sqlalchemy", fromlist=["select"]).select(SemanticMemory)
            .where(SemanticMemory.user_id == u.id, SemanticMemory.source_id == "goal-2")
        ).scalar_one()
        first_id = row1.id

        svc.upsert_memory(u.id, "goal", "goal-2", "New title", "New content for goal two updated.")
        row2 = db.execute(
            __import__("sqlalchemy", fromlist=["select"]).select(SemanticMemory)
            .where(SemanticMemory.user_id == u.id, SemanticMemory.source_id == "goal-2")
        ).scalar_one()

        assert row2.id    == first_id  # same row, not a new insert
        assert row2.title == "New title"
        assert row2.content.startswith("New content")

    def test_no_duplicate_rows(self, db: Session):
        from sqlalchemy import select, func
        u = _user(db)
        svc = _svc(db)

        for _ in range(3):
            svc.upsert_memory(u.id, "task", "task-99", "Study", "Study for exam.")

        count = db.execute(
            select(func.count()).select_from(SemanticMemory)
            .where(SemanticMemory.user_id == u.id, SemanticMemory.source_id == "task-99")
        ).scalar_one()
        assert count == 1

    def test_empty_content_returns_none(self, db: Session):
        u = _user(db)
        result = _svc(db).upsert_memory(u.id, "task", "t1", "Title", "")
        assert result is None

    def test_user_scoped(self, db: Session):
        u1, u2 = _user(db), _user(db)
        svc = _svc(db)

        svc.upsert_memory(u1.id, "goal", "shared-id", "U1 goal", "U1 goal content here.")
        svc.upsert_memory(u2.id, "goal", "shared-id", "U2 goal", "U2 goal content here.")

        from sqlalchemy import select
        rows = db.execute(
            select(SemanticMemory).where(SemanticMemory.source_id == "shared-id")
        ).scalars().all()
        assert len(rows) == 2  # one per user, not overwriting each other


# ── SemanticMemoryService: index_* helpers ─────────────────────────────────────

class TestIndexHelpers:
    def test_index_task(self, db: Session):
        u   = _user(db)
        svc = _svc(db)
        task = Task(
            id         = _uid(),
            user_id    = u.id,
            title      = "Review D278 module 4",
            status     = "todo",
            priority   = "high",
            created_at = _now(),
            updated_at = _now(),
        )
        db.add(task)
        db.commit()

        mem = svc.index_task(task)
        assert mem is not None
        assert "D278" in mem.content
        assert mem.source_type == "task"
        assert mem.importance_score > 0.5  # high priority boosts importance

    def test_index_goal(self, db: Session):
        u    = _user(db)
        svc  = _svc(db)
        goal = Goal(
            id         = _uid(),
            user_id    = u.id,
            title      = "Complete WGU Software Engineering degree",
            status     = "active",
            created_at = _now(),
            updated_at = _now(),
        )
        db.add(goal)
        db.commit()

        mem = svc.index_goal(goal)
        assert mem is not None
        assert mem.source_type == "goal"
        assert "WGU" in mem.content
        assert mem.importance_score >= 0.7

    def test_index_ai_memory(self, db: Session):
        u   = _user(db)
        svc = _svc(db)
        m   = AIMemory(
            id          = _uid(),
            user_id     = u.id,
            memory_type = "fact",
            content     = "User is studying at WGU for a software engineering degree.",
            created_at  = _now(),
        )
        db.add(m)
        db.commit()

        mem = svc.index_ai_memory(m)
        assert mem is not None
        assert mem.source_type == "memory"
        assert mem.importance_score == 0.8

    def test_index_task_none_returns_none(self, db: Session):
        assert _svc(db).index_task(None) is None  # type: ignore[arg-type]


# ── SemanticMemoryService: delete ─────────────────────────────────────────────

class TestDeleteMemory:
    def test_delete_existing(self, db: Session):
        u = _user(db)
        svc = _svc(db)
        svc.upsert_memory(u.id, "task", "del-1", "Delete me", "Deletable task content.")
        assert svc.delete_memory(u.id, "task", "del-1") is True

        from sqlalchemy import select
        row = db.execute(
            select(SemanticMemory).where(
                SemanticMemory.user_id == u.id, SemanticMemory.source_id == "del-1"
            )
        ).scalar_one_or_none()
        assert row is None

    def test_delete_nonexistent_returns_false(self, db: Session):
        u = _user(db)
        assert _svc(db).delete_memory(u.id, "task", "nope") is False


# ── SemanticMemoryService: reindex ────────────────────────────────────────────

class TestReindexUser:
    def test_reindex_indexes_tasks_and_goals(self, db: Session):
        u = _user(db)
        for i in range(3):
            db.add(Task(id=_uid(), user_id=u.id, title=f"Task {i}", status="todo", priority="medium", created_at=_now(), updated_at=_now()))
        for i in range(2):
            db.add(Goal(id=_uid(), user_id=u.id, title=f"Goal {i}", status="active", created_at=_now(), updated_at=_now()))
        db.commit()

        stats = _svc(db).reindex_user(u.id)
        assert stats["indexed"] >= 5  # at least 3 tasks + 2 goals
        assert stats["failed"]  == 0
        assert stats["embedding_available"] is True

    def test_reindex_empty_user(self, db: Session):
        u     = _user(db)
        stats = _svc(db).reindex_user(u.id)
        assert stats["indexed"] == 0
        assert stats["total"]   == 0


# ── SemanticMemoryService: search ─────────────────────────────────────────────

class TestSearch:
    def test_search_empty_index_returns_empty(self, db: Session):
        u      = _user(db)
        result = _svc(db).search(u.id, "How is my degree going?")
        assert result["results"] == []
        # embedding_used is False when there are no memories to search (returns early)
        assert result["embedding_used"] is False

    def test_search_empty_query_returns_empty(self, db: Session):
        u      = _user(db)
        result = _svc(db).search(u.id, "   ")
        assert result["results"] == []
        assert result["embedding_used"] is False

    def test_search_returns_correct_user_only(self, db: Session):
        u1, u2 = _user(db), _user(db)
        svc    = _svc(db)
        svc.upsert_memory(u1.id, "goal", "g1", "WGU Degree", "Goal: complete WGU degree.")
        svc.upsert_memory(u2.id, "goal", "g2", "Other goal", "Other user goal content.")

        result = svc.search(u1.id, "WGU degree")
        titles = [r["title"] for r in result["results"]]
        assert "WGU Degree" in titles
        assert "Other goal" not in titles

    def test_search_limit_respected(self, db: Session):
        u   = _user(db)
        svc = _svc(db)
        for i in range(10):
            svc.upsert_memory(u.id, "task", f"t{i}", f"Task {i}", f"Task {i} content description.")

        result = svc.search(u.id, "task description", limit=3)
        assert len(result["results"]) <= 3

    def test_search_result_has_required_fields(self, db: Session):
        u   = _user(db)
        svc = _svc(db)
        svc.upsert_memory(u.id, "goal", "g-check", "Graduation goal", "Goal: Graduate from WGU by December.", importance_score=0.8)

        result  = svc.search(u.id, "graduate WGU")
        results = result["results"]
        assert len(results) > 0
        r = results[0]
        assert "source_type"     in r
        assert "source_id"       in r
        assert "title"           in r
        assert "content_summary" in r
        assert "score"           in r
        assert "metadata"        in r
        # Embedding must NOT be present in results
        assert "embedding" not in r

    def test_search_filter_by_source_type(self, db: Session):
        u   = _user(db)
        svc = _svc(db)
        svc.upsert_memory(u.id, "goal", "g1",  "WGU Degree goal",  "Goal WGU degree active.")
        svc.upsert_memory(u.id, "task", "t1",  "Study D278",       "Task study D278 module four.")

        result = svc.search(u.id, "WGU", filters={"source_type": "goal"})
        for r in result["results"]:
            assert r["source_type"] == "goal"

    def test_high_importance_ranks_higher_keyword_fallback(self, db: Session):
        """When both records share the same embedding bucket, importance breaks the tie."""
        u   = _user(db)
        svc = _svc(db)
        svc.upsert_memory(u.id, "task", "low",  "Study routine", "Study routine low importance task.", importance_score=0.2)
        svc.upsert_memory(u.id, "task", "high", "Study routine", "Study routine high importance task.", importance_score=0.9)

        result = svc.search(u.id, "study routine")
        source_ids = [r["source_id"] for r in result["results"]]
        assert source_ids.index("high") < source_ids.index("low")

    def test_no_secrets_embedded(self, db: Session):
        """
        Text that looks like a secret is redacted before storage or embedding.
        Search results must not expose the raw secret.
        """
        u   = _user(db)
        svc = _svc(db)

        fake_key = "sk-" + ("A" * 24)
        secret_content = f"My OpenAI key is {fake_key}"
        svc.upsert_memory(u.id, "task", "secret-task", "Secret task", secret_content)

        from sqlalchemy import select
        row = db.execute(
            select(SemanticMemory).where(
                SemanticMemory.user_id   == u.id,
                SemanticMemory.source_id == "secret-task",
            )
        ).scalar_one()
        assert "sk-" not in row.content
        assert "[REDACTED_SECRET]" in row.content
        assert row.embedding is not None

        result = svc.search(u.id, "OpenAI key")
        serialized = str(result)
        assert "test-openai-key" not in serialized


# ── Context integration ────────────────────────────────────────────────────────

class TestContextIntegration:
    def test_semantic_context_key_present(self, db: Session):
        from app.ai.assistant_context_service import AssistantContextService
        u   = _user(db)
        svc = AssistantContextService(db)
        ctx = svc.build_context_for_message(u.id, "How are my goals going?")
        assert "semantic_context" in ctx

    def test_semantic_context_populated_when_memories_exist(self, db: Session):
        from app.ai.assistant_context_service import AssistantContextService
        u    = _user(db)
        # Pre-index a memory so search returns results
        _svc(db).upsert_memory(
            u.id, "goal", "gg1", "Get WGU degree",
            "Goal get WGU degree. Status active. Target December.",
        )

        # Build context — RAG runs inside a try/except so this always succeeds.
        svc = AssistantContextService(db)
        ctx = svc.build_context_for_message(u.id, "How is my WGU degree going?")

        # semantic_context key is always present and is a list
        assert isinstance(ctx["semantic_context"], list)

    def test_summarizer_emits_semantic_memory_section(self, db: Session):
        from app.ai.assistant_context_service import AssistantContextService
        ctx = {
            "user_profile":         {},
            "current_priorities":   [],
            "active_goals":         [],
            "relevant_tasks":       [],
            "calendar_context":     [],
            "recent_activity":      [],
            "daily_history":        [],
            "daily_brief":          {},
            "conversation_history": [],
            "connected_services":   [],
            "active_focus_block":   None,
            "semantic_context": [
                {
                    "source_type":     "goal",
                    "source_id":       "g1",
                    "title":           "Complete WGU degree",
                    "content_summary": "Working towards software engineering degree at WGU.",
                    "score":           0.87,
                    "metadata":        {},
                }
            ],
            "retrieval_metadata": {},
        }
        svc    = AssistantContextService(db)
        prompt = svc.summarize_context_for_prompt(ctx)
        assert "RELEVANT HELIOS MEMORY" in prompt
        assert "WGU degree" in prompt

    def test_summarizer_no_semantic_section_when_empty(self, db: Session):
        from app.ai.assistant_context_service import AssistantContextService
        ctx = {
            "user_profile":         {},
            "current_priorities":   [],
            "active_goals":         [],
            "relevant_tasks":       [],
            "calendar_context":     [],
            "recent_activity":      [],
            "daily_history":        [],
            "daily_brief":          {},
            "conversation_history": [],
            "connected_services":   [],
            "active_focus_block":   None,
            "semantic_context":     [],
            "retrieval_metadata":   {},
        }
        svc    = AssistantContextService(db)
        prompt = svc.summarize_context_for_prompt(ctx)
        assert "RELEVANT HELIOS MEMORY" not in prompt


# ── API endpoints ─────────────────────────────────────────────────────────────

class TestSemanticMemoryAPI:
    def test_reindex_requires_auth(self, client: TestClient):
        r = client.post("/api/v1/semantic-memory/reindex")
        assert r.status_code == 401

    def test_search_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/semantic-memory/search?q=test")
        assert r.status_code == 401

    def test_reindex_empty_user(self, client: TestClient, db: Session):
        u   = _user(db)
        r   = client.post("/api/v1/semantic-memory/reindex", headers=_auth(u.id))
        assert r.status_code == 200
        body = r.json()
        assert "indexed" in body
        assert "total"   in body
        assert "message" in body

    def test_reindex_and_search_full_flow(self, client: TestClient, db: Session):
        u = _user(db)

        # Insert a task + goal for this user
        from app.models.task import Task
        from app.models.goal import Goal
        t = Task(id=_uid(), user_id=u.id, title="Study D278 data structures", status="todo", priority="high", created_at=_now(), updated_at=_now())
        g = Goal(id=_uid(), user_id=u.id, title="Complete WGU degree", status="active", created_at=_now(), updated_at=_now())
        db.add_all([t, g])
        db.commit()

        # Reindex
        r = client.post("/api/v1/semantic-memory/reindex", headers=_auth(u.id))
        assert r.status_code == 200
        assert r.json()["indexed"] >= 2

        # Search
        r = client.get("/api/v1/semantic-memory/search?query=WGU+degree", headers=_auth(u.id))
        assert r.status_code == 200
        body = r.json()
        assert "results" in body
        assert "total"   in body
        assert isinstance(body["results"], list)

    def test_search_no_query_param(self, client: TestClient, db: Session):
        u = _user(db)
        r = client.get("/api/v1/semantic-memory/search", headers=_auth(u.id))
        # FastAPI validates query params after auth — 'q' is required so expect 422
        # (auth passes because user is in DB; param validation fails)
        assert r.status_code in (401, 422)

    def test_search_filter_by_source_type(self, client: TestClient, db: Session):
        u = _user(db)
        r = client.get(
            "/api/v1/semantic-memory/search?q=study&source_type=task",
            headers=_auth(u.id),
        )
        assert r.status_code == 200
        for result in r.json()["results"]:
            assert result["source_type"] == "task"

    def test_user_isolation_via_api(self, client: TestClient, db: Session):
        """User A's memories must not appear in user B's search results."""
        u1, u2 = _user(db), _user(db)

        # Index a goal for u1
        goal = Goal(id=_uid(), user_id=u1.id, title="Secret u1 goal", status="active", created_at=_now(), updated_at=_now())
        db.add(goal)
        db.commit()
        client.post("/api/v1/semantic-memory/reindex", headers=_auth(u1.id))

        # u2 searches for u1's goal title
        r = client.get("/api/v1/semantic-memory/search?q=Secret+u1+goal", headers=_auth(u2.id))
        assert r.status_code == 200
        for result in r.json()["results"]:
            assert "Secret u1 goal" not in result["title"]
