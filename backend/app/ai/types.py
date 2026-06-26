from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class AIErrorCode(str, Enum):
    INVALID_API_KEY = "invalid_api_key"
    RATE_LIMITED = "rate_limited"
    TIMEOUT = "timeout"
    PROVIDER_OFFLINE = "provider_offline"
    NETWORK_ERROR = "network_error"
    MALFORMED_RESPONSE = "malformed_response"
    UNKNOWN_ERROR = "unknown_error"


NON_RETRYABLE_ERROR_CODES = {AIErrorCode.INVALID_API_KEY, AIErrorCode.MALFORMED_RESPONSE}
TRANSIENT_ERROR_CODES = {
    AIErrorCode.RATE_LIMITED,
    AIErrorCode.TIMEOUT,
    AIErrorCode.PROVIDER_OFFLINE,
    AIErrorCode.NETWORK_ERROR,
    AIErrorCode.UNKNOWN_ERROR,
}


@dataclass
class AIProviderResponse:
    provider: str
    model: str
    content: Any
    usage: dict[str, Any] | None
    finish_reason: str | None
    latency_ms: int
    timestamp: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "model": self.model,
            "content": self.content,
            "usage": self.usage,
            "finish_reason": self.finish_reason,
            "latency_ms": self.latency_ms,
            "timestamp": self.timestamp,
        }


@dataclass
class AIProviderHealth:
    provider: str
    model: str
    healthy: bool
    checked_at: str
    error: str | None = None
    latency_ms: int | None = None


class HeliosAIError(RuntimeError):
    def __init__(
        self,
        code: AIErrorCode,
        message: str,
        *,
        provider: str | None = None,
        retryable: bool | None = None,
        raw_error: Exception | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.provider = provider
        self.retryable = retryable if retryable is not None else code in TRANSIENT_ERROR_CODES
        self.raw_error = raw_error

    def public_detail(self) -> dict[str, Any]:
        return {
            "error": "helios_ai_unavailable",
            "code": self.code.value,
            "message": self.message,
            "provider": self.provider,
        }


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()
