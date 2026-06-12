from typing import Any, Literal

from pydantic import BaseModel, Field

RiskLevel = Literal["low", "medium", "high"]
QueueStatus = Literal["pending", "approved", "rejected", "completed"]
UpdateableStatus = Literal["approved", "rejected", "completed"]


class AutonomyQueueItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    source_agent: str = Field(..., min_length=1, max_length=100)
    proposed_action_type: str = Field(..., min_length=1, max_length=100)
    payload_preview: dict[str, Any] = Field(default_factory=dict)
    risk_level: RiskLevel = "low"


class AutonomyQueueStatusUpdate(BaseModel):
    status: UpdateableStatus


class AutonomyQueueItemOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str | None
    source_agent: str
    proposed_action_type: str
    payload_preview: dict[str, Any]
    risk_level: str
    status: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class AutonomyQueueListResponse(BaseModel):
    items: list[AutonomyQueueItemOut]
    total: int
