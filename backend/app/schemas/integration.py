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
    scopes: list[str]


class IntegrationListResponse(BaseModel):
    integrations: list[IntegrationOut]


class MockConnectRequest(BaseModel):
    provider: IntegrationProvider
