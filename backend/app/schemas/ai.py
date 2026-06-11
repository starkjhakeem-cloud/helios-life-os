from typing import Literal

from pydantic import BaseModel, Field


class BriefingPriority(BaseModel):
    label: str
    detail: str


class DailyBriefing(BaseModel):
    greeting: str
    summary: str
    priorities: list[BriefingPriority]
    risks: list[str]
    focus_block: str        # concrete focus block suggestion for today
    recommended_agent: str  # one of the five HELIOS agent names
    # Email-aware fields — populated when UNREAD MESSAGES context is available.
    email_summary: str | None = None
    important_emails: list[str] = []          # subject + sender pairs needing action
    email_risks: list[str] = []               # communication-layer risks
    suggested_email_actions: list[str] = []   # concrete verb-first reply/archive actions
    # V2.9 — which data sources contributed to this briefing (set by the router, not the AI).
    context_sources: list[str] = []
    generated_at: str       # ISO 8601


# ── Planning ──────────────────────────────────────────────────────────────────

class PlanRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    planning_horizon_days: int = Field(default=30, ge=1, le=365)
    goal_id: str | None = None


class PlanStep(BaseModel):
    step_number: int
    title: str
    description: str
    day_target: int  # complete by this day within the horizon


class PlanResponse(BaseModel):
    plan_title: str
    summary: str
    steps: list[PlanStep]
    estimated_timeline: str
    risks: list[str]
    recommendation: str
    generated_at: str


# ── Chat ──────────────────────────────────────────────────────────────────────

ActionType = Literal[
    "create_task",
    "update_task_status",
    "create_goal",
    "prioritize_tasks",
    "generate_plan",
]


class RecommendedAction(BaseModel):
    id: str
    type: ActionType
    title: str
    description: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    payload_preview: dict
    # Structured payload for actual execution; None for non-executable types
    execution_payload: dict | None = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    context_type: str | None = None       # "goals", "tasks", "analytics", "general"
    related_goal_id: str | None = None    # reserved for future contextual grounding
    related_task_id: str | None = None
    include_context: bool = False         # when True, inject live goals/tasks into AI prompt


class ChatResponse(BaseModel):
    reply: str
    suggested_actions: list[str]
    follow_up_questions: list[str]
    recommended_actions: list[RecommendedAction]
    provider: str
    generated_at: str


# ── Action execution ───────────────────────────────────────────────────────────

# Subset of ActionType that the execution endpoint actually handles.
# Pydantic enforces this at the schema level — any other value produces 422.
ExecutableActionType = Literal["create_task", "update_task_status", "create_goal"]


class CreateTaskPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["todo", "in_progress", "done"] = "todo"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    due_date: str | None = None
    linked_goal_id: str | None = None


class CreateGoalPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["active", "completed", "paused"] = "active"
    target_date: str | None = None


class UpdateTaskStatusPayload(BaseModel):
    task_id: str = Field(..., min_length=1)
    status: Literal["todo", "in_progress", "done"]


class ActionExecuteRequest(BaseModel):
    action_type: ExecutableActionType
    payload: dict  # validated downstream against the type-specific schema


class ActionExecuteResult(BaseModel):
    success: bool
    action_type: str
    message: str
    created_or_updated_id: str | None = None
    executed_at: str
