from typing import Literal

from pydantic import BaseModel, Field

IntegrationProvider = Literal["google_calendar", "gmail", "outlook_calendar", "outlook_mail"]
IntegrationStatus = Literal["connected", "disconnected", "needs_attention", "syncing", "error"]
GoogleServiceType = Literal["calendar", "gmail", "both"]


class IntegrationOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str | None          # None for providers that have never been connected
    provider: str
    service_type: str | None = None
    email: str | None = None
    display_name: str | None = None
    status: str
    connected_at: str | None
    last_sync_at: str | None
    token_expires_at: str | None  # UTC ISO-8601; null until real OAuth tokens are stored
    scopes: list[str]
    requires_reconnect: bool = False
    # NOTE: access_token_encrypted and refresh_token_encrypted are never exposed via API


class IntegrationListResponse(BaseModel):
    integrations: list[IntegrationOut]
    provider: str = "google"
    services: list["ConnectedServiceOut"] = Field(default_factory=list)


class MockConnectRequest(BaseModel):
    provider: IntegrationProvider


class SyncJobOut(BaseModel):
    id: str
    integration_id: str
    provider: str
    service_type: str | None = None
    status: str             # "running" | "completed" | "failed"
    started_at: str
    completed_at: str | None
    records_processed: int
    records_created: int
    records_updated: int
    records_skipped: int = 0
    error_message: str | None = None
    errors: list[str]


class SyncStatusResponse(BaseModel):
    jobs: list[SyncJobOut]


class ConnectUrlResponse(BaseModel):
    """Returned by GET /integrations/google/connect-url."""
    url: str         # Full authorization URL; placeholder when GOOGLE_CLIENT_ID is unset
    state: str       # CSRF state token — not yet persisted in V2.15
    configured: bool # True when GOOGLE_CLIENT_ID is present in config
    note: str        # Developer note explaining current skeleton limitations
    service_type: str | None = None
    scopes: list[str] = Field(default_factory=list)


class CallbackResponse(BaseModel):
    """Returned by GET /integrations/google/callback (skeleton)."""
    success: bool
    provider: str
    code_received: bool
    note: str


class ExchangeCodeRequest(BaseModel):
    """Sent by the mobile app to POST /integrations/google/exchange."""
    code: str
    state: str | None = None   # CSRF state token; verified when persistence is wired
    service_type: GoogleServiceType = "both"


class ExchangeCodeResponse(BaseModel):
    """Returned by POST /integrations/google/exchange."""
    success: bool
    provider: str
    stub: bool          # True when exchange returned placeholder tokens (not real)
    tokens_stored: bool # True when tokens were encrypted and persisted (V2.17+)
    note: str
    services: list[str] = Field(default_factory=list)


class ConnectedServiceOut(BaseModel):
    service_type: str
    status: str
    requires_reconnect: bool = False
    email: str | None
    display_name: str | None = None
    last_sync_at: str | None
    automatic_sync: bool
    token_expires_at: str | None = None
    scopes: list[str] = Field(default_factory=list)


class GoogleSyncRequest(BaseModel):
    service_type: GoogleServiceType = "both"


class SyncSummaryOut(BaseModel):
    provider: str
    service_type: str
    status: str
    started_at: str
    completed_at: str | None
    records_created: int
    records_updated: int
    records_skipped: int
    error_message: str | None
    sync_job_id: str | None = None


class GoogleSyncResponse(BaseModel):
    provider: str = "google"
    summaries: list[SyncSummaryOut]


class GoogleDisconnectRequest(BaseModel):
    service_type: GoogleServiceType = "both"


class GoogleDisconnectResponse(BaseModel):
    provider: str = "google"
    disconnected: list[str]
