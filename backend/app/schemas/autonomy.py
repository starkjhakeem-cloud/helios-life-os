from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.ai import PlanResponse

RiskLevel = Literal["low", "medium", "high"]
QueueStatus = Literal["pending", "approved", "rejected", "completed"]
UpdateableStatus = Literal["approved", "rejected", "completed"]

# Action types that the autonomy execution bridge will handle.
# generate_plan is added here but not in ai.py's ExecutableActionType because
# the plan endpoint has a different response shape (plan field vs. plain result).
_SAFE_AUTONOMY_ACTIONS: frozenset[str] = frozenset({
    "create_task",
    "create_goal",
    "update_task_status",
    "generate_plan",
})


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


# ── Execution bridge ──────────────────────────────────────────────────────────

class GeneratePlanPayload(BaseModel):
    """Expected shape of payload_preview for generate_plan queue items."""
    prompt: str = Field(..., min_length=1, max_length=1000)
    planning_horizon_days: int = Field(default=30, ge=1, le=365)
    goal_id: str | None = None


class AutonomyExecuteResult(BaseModel):
    success: bool
    action_type: str
    message: str
    queue_item_id: str
    created_or_updated_id: str | None = None
    executed_at: str
    # Only populated for generate_plan executions.
    plan: PlanResponse | None = None
