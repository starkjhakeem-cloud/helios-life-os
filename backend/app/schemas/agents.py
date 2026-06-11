from pydantic import BaseModel


class AgentCapability(BaseModel):
    id: str
    label: str
    description: str


class AgentProfile(BaseModel):
    id: str
    name: str
    role: str
    description: str
    status: str  # active | standby | offline
    priority: int
    capabilities: list[AgentCapability]
    memory_context_enabled: bool


class AgentsResponse(BaseModel):
    agents: list[AgentProfile]


class AgentContextSummary(BaseModel):
    """
    User-specific context snapshot returned by the detail endpoint.
    Shows how much AI context this agent has access to for the current user.
    No raw memory content is surfaced here — only counts and a readiness flag.
    """
    total_memories: int
    active_goal_count: int
    has_context: bool  # True when user has at least one memory or active goal


class AgentDetail(AgentProfile):
    """Full agent profile enriched with a user-specific context summary."""
    context_summary: AgentContextSummary
