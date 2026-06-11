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


# ── V2.3: Agent Context Engine ────────────────────────────────────────────────

class AgentContextSection(BaseModel):
    """
    One data-source slice of the context package.
    The frontend uses this to show what information an agent can reason from.
    """
    category: str    # "memory" | "goals" | "tasks" | "analytics" | "conversations"
    label: str       # human-readable display name
    description: str  # one sentence: what this source contributes to the agent
    is_active: bool  # True when this agent is configured to use this source
    item_count: int  # number of items available in the user's data
    items: list[str]  # up to 5 short human-readable preview strings (no IDs)


class AgentContextPackage(BaseModel):
    """
    Full context package for a specific agent + user pair.
    Returned by GET /agents/{agent_id}/context.
    All item previews are safe to display — no secrets, no raw IDs.
    """
    agent_id: str
    agent_name: str
    sections: list[AgentContextSection]
    generated_at: str
