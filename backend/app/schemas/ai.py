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
