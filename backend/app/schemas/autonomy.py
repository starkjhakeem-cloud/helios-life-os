from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.ai import PlanResponse

RiskLevel = Literal["low", "medium", "high"]
QueueStatus = Literal["pending", "approved", "rejected", "completed"]
UpdateableStatus = Literal["approved", "rejected", "completed"]

_SAFE_AUTONOMY_ACTIONS: frozenset[str] = frozenset({
    "create_task",
    "create_goal",
    "update_task_status",
    "generate_plan",
})


# ── Queue CRUD ────────────────────────────────────────────────────────────────

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


# ── Proactive suggestions ─────────────────────────────────────────────────────

class SuggestionItem(BaseModel):
    id: str
    title: str
    description: str
    source_agent: str
    suggested_action_type: str
    risk_level: str
    reason: str
    payload_preview: dict[str, Any]
    created_at: str


class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionItem]
    total: int
    generated_at: str
    # Provenance: "ai" = real AI provider, "local" = rule-based, "hybrid" = both
    source: str = "local"
    # True when AI failed and suggestions came from a local fallback
    degraded: bool = False
    # Human-readable reason when degraded is True
    message: str | None = None


# ── Daily plan ────────────────────────────────────────────────────────────────

class FocusBlock(BaseModel):
    time_range: str
    activity: str
    task_title: str | None = None
    energy_level: str  # "high" | "medium" | "low"


class PriorityTask(BaseModel):
    rank: int
    title: str
    priority: str  # "critical" | "high" | "medium" | "low"
    estimated_duration: str
    linked_goal: str | None = None
    reason: str


class DailyPlanRequest(BaseModel):
    target_date: str | None = None


class DailyPlan(BaseModel):
    plan_date: str
    overview: str
    focus_blocks: list[FocusBlock]
    priority_tasks: list[PriorityTask]
    schedule_conflicts: list[str]
    recommended_agent_actions: list[str]
    risks: list[str]
    suggested_queue_items: list[SuggestionItem]
    generated_at: str


# ── Approval rules ────────────────────────────────────────────────────────────

class AutonomyRuleCreate(BaseModel):
    action_type: str = Field(..., min_length=1, max_length=100)
    risk_level: RiskLevel | None = None
    requires_manual_approval: bool = True
    allow_execution: bool = True
    notes: str | None = Field(default=None, max_length=500)


class AutonomyRuleUpdate(BaseModel):
    requires_manual_approval: bool | None = None
    allow_execution: bool | None = None
    notes: str | None = None


class AutonomyRuleOut(BaseModel):
    id: str
    user_id: str
    action_type: str
    risk_level: str | None
    requires_manual_approval: bool
    allow_execution: bool
    notes: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class AutonomyRulesResponse(BaseModel):
    rules: list[AutonomyRuleOut]
    total: int


# ── Audit log ─────────────────────────────────────────────────────────────────

AuditEventType = Literal[
    "suggestion_created",
    "queue_item_created",
    "queue_item_approved",
    "queue_item_rejected",
    "queue_item_executed",
    "execution_blocked_by_rule",
    "execution_failed",
]


class AutonomyAuditLogOut(BaseModel):
    id: str
    user_id: str
    event_type: str
    source: str
    related_queue_item_id: str | None
    action_type: str | None
    risk_level: str | None
    message: str
    metadata: dict[str, Any]
    created_at: str

    model_config = {"from_attributes": True}


class AutonomyAuditLogListResponse(BaseModel):
    entries: list[AutonomyAuditLogOut]
    total: int
