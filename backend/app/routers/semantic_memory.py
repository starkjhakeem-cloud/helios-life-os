"""
Semantic Memory Router — HELIOS Phase 3

Endpoints:
  POST /api/v1/semantic-memory/reindex   — rebuild all memories for the authed user
  GET  /api/v1/semantic-memory/search    — meaning-based search across user memories

All endpoints require a valid JWT (same auth flow as every other HELIOS router).
All results are scoped to the authenticated user — no cross-user leakage is possible.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.semantic_memory_service import SemanticMemoryService

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────

class ReindexResponse(BaseModel):
    indexed: int
    failed: int
    total: int
    embedding_available: bool
    message: str


class SearchResult(BaseModel):
    source_type: str
    source_id: str
    title: str
    content_summary: str | None
    score: float
    metadata: dict


class SearchResponse(BaseModel):
    query: str
    embedding_used: bool
    results: list[SearchResult]
    total: int


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/reindex", response_model=ReindexResponse, status_code=200)
def reindex_user_memories(
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db),
) -> ReindexResponse:
    """
    Rebuild the semantic memory index for the authenticated user.

    Iterates over all tasks, goals, calendar events, daily history records,
    AI memories, and recent conversation messages. Previously indexed entries
    are updated in place (upsert). Run this after bulk imports or whenever
    a user's data diverges from the index.
    """
    svc   = SemanticMemoryService(db)
    stats = svc.reindex_user(current_user.id)

    message = (
        f"Indexed {stats['indexed']} memories using semantic embeddings."
        if stats["embedding_available"]
        else f"Indexed {stats['indexed']} memories (keyword fallback — "
             "set OPENAI_API_KEY to enable full semantic search)."
    )

    return ReindexResponse(
        indexed             = stats["indexed"],
        failed              = stats["failed"],
        total               = stats["total"],
        embedding_available = stats["embedding_available"],
        message             = message,
    )


@router.get("/search", response_model=SearchResponse, status_code=200)
def search_memories(
    q:            str | None    = Query(None, min_length=1, description="Natural-language search query"),
    query:        str | None    = Query(None, min_length=1, description="Natural-language search query"),
    limit:        int           = Query(10,  ge=1, le=50),
    source_type:  str | None    = Query(None, description="Filter by source type (task, goal, etc.)"),
    context_type: str | None    = Query(None, description="Context hint for ranking (school, tasks, goals, etc.)"),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
) -> SearchResponse:
    """
    Search the user's semantic memory using natural language.

    Example: GET /api/v1/semantic-memory/search?query=how+is+my+WGU+degree+going

    When embeddings are available, results are ranked by meaning. When they're
    not (no API key), ranking falls back to keyword + recency + importance.

    Raw secrets, API keys, OAuth tokens, and other sensitive values are never
    stored in or returned from the semantic memory index.
    """
    filters = {}
    if source_type:
        filters["source_type"] = source_type

    search_query = query or q
    if not search_query:
        raise HTTPException(status_code=422, detail="query is required.")

    svc    = SemanticMemoryService(db)
    result = svc.search(
        user_id      = current_user.id,
        query        = search_query,
        limit        = limit,
        filters      = filters if filters else None,
        context_type = context_type,
    )

    return SearchResponse(
        query         = result["query"],
        embedding_used= result["embedding_used"],
        results       = [SearchResult(**r) for r in result["results"]],
        total         = len(result["results"]),
    )
