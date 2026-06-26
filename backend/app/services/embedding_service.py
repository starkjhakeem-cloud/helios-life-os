"""
Embedding Service — HELIOS Phase 3

Generates text embeddings using the OpenAI Embeddings API.

Responsibilities:
  - Normalize and sanitize text before embedding
  - Detect and refuse to embed content that looks like secrets
  - Return None (never raise) on any API failure so callers can fall back
  - Support single and batch generation

Usage:
    svc = EmbeddingService()
    vec = svc.generate_embedding("Study D278 data structures")
    # vec: list[float] (1536 dims) or None if unavailable

Environment:
    OPENAI_API_KEY            — enables real embeddings (required for prod)
    OPENAI_EMBEDDING_MODEL    — defaults to "text-embedding-3-small"
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Maximum characters sent to the API per text item
# text-embedding-3-small supports ~8191 tokens; 8000 chars is a safe proxy
_MAX_CHARS = 8_000

# Batch size limit (OpenAI allows up to 2048 inputs; 100 is a safe default)
_BATCH_SIZE = 100

# Dimension of text-embedding-3-small
EMBEDDING_DIM = 1536

# Patterns that identify content that should never be embedded
_SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"sk-[A-Za-z0-9]{20,}"),                       # OpenAI API keys
    re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*"),            # Bearer tokens
    re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"),       # JWTs
    re.compile(r"[A-Za-z0-9+/]{60,}={0,2}"),                   # Long base64 blobs
    re.compile(r"(?i)password\s*[:=]\s*\S+"),                   # password=... pairs
    re.compile(r"(?i)api[_\-]?key\s*[:=]\s*\S{10,}"),          # api_key=... pairs
]


class EmbeddingService:
    """
    Wraps the OpenAI Embeddings API with graceful degradation.

    When OPENAI_API_KEY is not set, available=False and all methods
    return None/empty without raising, so the rest of HELIOS continues
    to work with deterministic keyword-based context.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.api_key = api_key or settings.openai_api_key
        self.model   = model or settings.openai_embedding_model
        self._client: Any = None
        self.available = False

        if self.api_key:
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=self.api_key, timeout=30)
                self.available = True
                logger.debug("EmbeddingService: OpenAI client initialised (model=%s)", self.model)
            except ImportError:
                logger.warning(
                    "EmbeddingService: openai package not installed — "
                    "semantic search will use keyword fallback. "
                    "Install: pip install openai"
                )
        else:
            logger.debug(
                "EmbeddingService: OPENAI_API_KEY not set — "
                "embedding generation disabled; keyword fallback active."
            )

    # ── Public API ─────────────────────────────────────────────────────────────

    def generate_embedding(self, text: str) -> list[float] | None:
        """
        Generate a single embedding vector.

        Returns None without raising if:
          - OPENAI_API_KEY is not configured
          - text is empty after normalization
          - the API call fails for any reason
        """
        normalized = self.normalize_text_for_embedding(text)
        if not normalized:
            return None
        if not self.available or self._client is None:
            return None

        try:
            response = self._client.embeddings.create(
                model=self.model,
                input=normalized,
            )
            return response.data[0].embedding
        except Exception as exc:
            logger.warning("EmbeddingService: generate_embedding failed — %s", exc)
            return None

    def generate_embeddings(self, texts: list[str]) -> list[list[float] | None]:
        """
        Batch-generate embeddings, sending up to _BATCH_SIZE items per API call.

        Returns a list of the same length as `texts`; failed items are None.
        """
        if not texts:
            return []

        results: list[list[float] | None] = []

        for batch_start in range(0, len(texts), _BATCH_SIZE):
            batch_raw = texts[batch_start : batch_start + _BATCH_SIZE]
            normalized = [self.normalize_text_for_embedding(t) for t in batch_raw]

            # Identify which items we can actually embed
            valid: list[tuple[int, str]] = [
                (i, t) for i, t in enumerate(normalized) if t
            ]

            batch_results: list[list[float] | None] = [None] * len(batch_raw)

            if valid and self.available and self._client:
                try:
                    response = self._client.embeddings.create(
                        model=self.model,
                        input=[t for _, t in valid],
                    )
                    for api_idx, (orig_idx, _) in enumerate(valid):
                        batch_results[orig_idx] = response.data[api_idx].embedding
                except Exception as exc:
                    logger.warning(
                        "EmbeddingService: batch generate_embeddings failed — %s", exc
                    )

            results.extend(batch_results)

        return results

    def normalize_text_for_embedding(self, text: str) -> str:
        """
        Clean, truncate, and validate text before embedding.

        Redacts potential secrets before embedding. Returns empty string when
        text is blank after normalization.
        """
        if not text or not text.strip():
            return ""

        if self._looks_like_secret(text):
            logger.warning(
                "EmbeddingService: redacting potential secret before embedding"
            )
            text = self.redact_secrets(text)

        # Collapse whitespace, normalise unicode, strip
        cleaned = re.sub(r"\s+", " ", text.strip())
        return cleaned[:_MAX_CHARS]

    # ── Private helpers ────────────────────────────────────────────────────────

    def _looks_like_secret(self, text: str) -> bool:
        """Heuristic check for API keys, tokens, passwords."""
        return any(p.search(text) for p in _SECRET_PATTERNS)

    def contains_potential_secret(self, text: str) -> bool:
        """Return True when text appears to contain credentials or tokens."""
        return self._looks_like_secret(text or "")

    def redact_secrets(self, text: str) -> str:
        """Replace credential-looking substrings with a stable redaction marker."""
        redacted = text or ""
        for pattern in _SECRET_PATTERNS:
            redacted = pattern.sub("[REDACTED_SECRET]", redacted)
        return redacted

    def choose_embedding_provider(self) -> str:
        """Expose the active embedding backend for diagnostics/tests."""
        return "openai" if self.available else "none"
