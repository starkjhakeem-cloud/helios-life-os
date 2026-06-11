from typing import Literal

from pydantic import BaseModel

IntegrationProvider = Literal["google_calendar", "gmail", "outlook_calendar", "outlook_mail"]
IntegrationStatus = Literal["connected", "disconnected"]


class IntegrationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str | None          # None for providers that have never been connected
    provider: str
    status: str
    connected_at: str | None
    last_sync_at: str | None
    token_expires_at: str | None  # UTC ISO-8601; null until real OAuth tokens are stored
    scopes: list[str]
    # NOTE: access_token_encrypted and refresh_token_encrypted are never exposed via API


class IntegrationListResponse(BaseModel):
    integrations: list[IntegrationOut]


class MockConnectRequest(BaseModel):
    provider: IntegrationProvider


class SyncJobOut(BaseModel):
    id: str
    integration_id: str
    provider: str
    status: str             # "running" | "completed" | "failed"
    started_at: str
    completed_at: str | None
    records_processed: int
    records_created: int
    records_updated: int
    errors: list[str]


class SyncStatusResponse(BaseModel):
    jobs: list[SyncJobOut]


class ConnectUrlResponse(BaseModel):
    """Returned by GET /integrations/google/connect-url."""
    url: str         # Full authorization URL; placeholder when GOOGLE_CLIENT_ID is unset
    state: str       # CSRF state token — not yet persisted in V2.15
    configured: bool # True when GOOGLE_CLIENT_ID is present in config
    note: str        # Developer note explaining current skeleton limitations


class CallbackResponse(BaseModel):
    """Returned by GET /integrations/google/callback (skeleton)."""
    success: bool
    provider: str
    code_received: bool
    note: str
