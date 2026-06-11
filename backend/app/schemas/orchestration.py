from pydantic import BaseModel, Field
from typing import Literal

OrchestrationContextScope = Literal["daily_briefing", "assistant_chat", "planning"]


class AgentAssessment(BaseModel):
    agent_id: str
    agent_name: str
    role: str
    perspective: str          # 1-2 sentences from this agent's domain
    key_actions: list[str]    # 2-3 domain-specific recommended actions
    confidence: float         # 0.0-1.0 relevance to this objective


class OrchestrationRequest(BaseModel):
    objective: str = Field(..., min_length=1, max_length=1000)
    # None = all five agents participate; otherwise only the specified subset
    selected_agent_ids: list[str] | None = None
    context_scope: OrchestrationContextScope = "daily_briefing"


class OrchestrationResponse(BaseModel):
    objective: str
    participating_agents: list[str]          # agent names that contributed
    agent_assessments: list[AgentAssessment]
    coordinated_plan: str                    # synthesized multi-agent plan
    risks: list[str]                         # cross-domain risks
    # Advisory only — operator must review before taking any action.
    recommended_next_actions: list[str]
    context_scope: str
    generated_at: str
