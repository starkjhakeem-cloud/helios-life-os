from pydantic import BaseModel


class BriefingPriority(BaseModel):
    label: str
    detail: str


class DailyBriefing(BaseModel):
    summary: str
    priorities: list[BriefingPriority]
    risks: list[str]
    recommendation: str
    generated_at: str  # ISO 8601 — swapped for LLM output in a future phase
