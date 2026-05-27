from typing import Literal

from pydantic import BaseModel, Field


class BriefingPriority(BaseModel):
    label: str
    detail: str


class DailyBriefing(BaseModel):
    summary: str
    priorities: list[BriefingPriority]
    risks: list[str]
    recommendation: str
    generated_at: str  # ISO 8601 — swapped for LLM output in a future phase


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
