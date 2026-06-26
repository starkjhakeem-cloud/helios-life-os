from __future__ import annotations

from enum import Enum
from typing import Any


class IntegrationErrorCode(str, Enum):
    MISSING_CREDENTIALS = "missing_credentials"
    OAUTH_DENIED = "oauth_denied"
    INVALID_GRANT = "invalid_grant"
    TOKEN_EXPIRED = "token_expired"
    REFRESH_FAILED = "refresh_failed"
    API_RATE_LIMITED = "api_rate_limited"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    SYNC_FAILED = "sync_failed"
    UNKNOWN_ERROR = "unknown_error"


class IntegrationError(RuntimeError):
    def __init__(
        self,
        code: IntegrationErrorCode,
        message: str,
        *,
        status_code: int = 502,
        provider: str = "google",
        service_type: str | None = None,
        raw_error: Exception | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.provider = provider
        self.service_type = service_type
        self.raw_error = raw_error

    def public_detail(self) -> dict[str, Any]:
        return {
            "error": "integration_unavailable",
            "code": self.code.value,
            "message": self.message,
            "provider": self.provider,
            "service_type": self.service_type,
        }
