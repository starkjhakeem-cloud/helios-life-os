from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.agents import AgentProfile, AgentsResponse

router = APIRouter()

_AGENTS: list[AgentProfile] = [
    AgentProfile(
        id="strategy",
        name="Strategy Agent",
        role="Strategic Planning",
        status="active",
        description=(
            "Analyses long-term goals, breaks them into quarterly milestones, "
            "and surfaces misalignments between daily activity and core objectives."
        ),
        priority=1,
    ),
    AgentProfile(
        id="finance",
        name="Finance Agent",
        role="Financial Intelligence",
        status="active",
        description=(
            "Monitors income streams, spending patterns, and savings velocity. "
            "Flags anomalies and projects runway against declared financial targets."
        ),
        priority=2,
    ),
    AgentProfile(
        id="study",
        name="Study Agent",
        role="Knowledge Acquisition",
        status="active",
        description=(
            "Tracks learning objectives, optimises spaced-repetition schedules, "
            "and synthesises new material against existing knowledge maps."
        ),
        priority=3,
    ),
    AgentProfile(
        id="health",
        name="Health Agent",
        role="Biometric Operations",
        status="standby",
        description=(
            "Integrates sleep, activity, and nutrition data to surface recovery "
            "status and recommend protocol adjustments for peak performance."
        ),
        priority=4,
    ),
    AgentProfile(
        id="career",
        name="Career Agent",
        role="Professional Development",
        status="standby",
        description=(
            "Maps skill gaps against target roles, tracks networking momentum, "
            "and identifies leverage points for accelerating career trajectory."
        ),
        priority=5,
    ),
]


@router.get("", response_model=AgentsResponse)
def list_agents(_: User = Depends(get_current_user)) -> AgentsResponse:
    return AgentsResponse(agents=_AGENTS)
