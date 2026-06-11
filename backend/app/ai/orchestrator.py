"""
Agent Orchestration Service — V2.10

Resolves the context scope, builds operator context through the unified
engine, and delegates to the AI provider for multi-agent assessment.

No records are created, updated, or deleted here.
Output is advisory only — the operator decides what to act on.
"""

from sqlalchemy.orm import Session

from app.ai.context_service import ContextScope, build_context
from app.schemas.agents import AgentProfile
from app.schemas.orchestration import OrchestrationResponse

_SCOPE_MAP: dict[str, ContextScope] = {
    "daily_briefing": ContextScope.DAILY_BRIEFING,
    "assistant_chat": ContextScope.ASSISTANT_CHAT,
    "planning":       ContextScope.PLANNING,
}


def run_orchestration(
    *,
    objective: str,
    agents: list[AgentProfile],
    context_scope: str,
    user_id: str,
    user_name: str,
    db: Session,
) -> OrchestrationResponse:
    """
    Build operator context for the chosen scope and invoke the AI provider's
    multi-agent orchestration. Returns a fully structured response; no side
    effects on any database records.
    """
    from app.ai.factory import get_ai_provider

    scope = _SCOPE_MAP.get(context_scope, ContextScope.DAILY_BRIEFING)
    ctx = build_context(scope, user_id, db, user_name=user_name)

    agent_dicts = [
        {
            "id":          a.id,
            "name":        a.name,
            "role":        a.role,
            "description": a.description,
        }
        for a in agents
    ]

    return get_ai_provider().orchestrate_agents(
        objective=objective,
        agents=agent_dicts,
        user_context=ctx.text,
        user_name=user_name,
    )
