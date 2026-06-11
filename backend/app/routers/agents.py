from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.memory import AIMemory
from app.models.user import User
from app.schemas.agents import (
    AgentCapability,
    AgentContextSummary,
    AgentDetail,
    AgentProfile,
    AgentsResponse,
)

router = APIRouter()

# ── Agent definitions ─────────────────────────────────────────────────────────
# Static catalogue: agent metadata does not vary per user.
# The detail endpoint adds a user-specific context_summary at query time.

_AGENTS: list[AgentProfile] = [
    AgentProfile(
        id="strategy",
        name="Strategy Agent",
        role="Strategic Planning",
        status="active",
        priority=1,
        memory_context_enabled=True,
        description=(
            "Analyses long-term goals, breaks them into quarterly milestones, "
            "and surfaces misalignments between daily activity and core objectives."
        ),
        capabilities=[
            AgentCapability(
                id="goal_analysis",
                label="Goal Analysis",
                description="Evaluates goal clarity, feasibility, and alignment with stated priorities.",
            ),
            AgentCapability(
                id="milestone_planning",
                label="Milestone Planning",
                description="Breaks multi-month goals into time-boxed phases with concrete deliverables.",
            ),
            AgentCapability(
                id="priority_alignment",
                label="Priority Alignment",
                description="Detects when daily tasks drift from declared long-term objectives.",
            ),
            AgentCapability(
                id="risk_identification",
                label="Risk Identification",
                description="Surfaces blockers, dependencies, and single points of failure in active plans.",
            ),
            AgentCapability(
                id="progress_review",
                label="Progress Review",
                description="Generates weekly execution reviews against planned milestones.",
            ),
        ],
    ),
    AgentProfile(
        id="finance",
        name="Finance Agent",
        role="Financial Intelligence",
        status="standby",
        priority=2,
        memory_context_enabled=False,
        description=(
            "Monitors income streams, spending patterns, and savings velocity. "
            "Flags anomalies and projects runway against declared financial targets."
        ),
        capabilities=[
            AgentCapability(
                id="budget_tracking",
                label="Budget Tracking",
                description="Monitors declared budgets against actual spending across categories.",
            ),
            AgentCapability(
                id="savings_analysis",
                label="Savings Analysis",
                description="Tracks savings rate velocity relative to declared financial goals.",
            ),
            AgentCapability(
                id="income_monitoring",
                label="Income Monitoring",
                description="Tracks income streams and flags irregularities or missed expectations.",
            ),
            AgentCapability(
                id="financial_projection",
                label="Financial Projection",
                description="Projects runway and net-worth trajectory under current spending patterns.",
            ),
            AgentCapability(
                id="anomaly_detection",
                label="Anomaly Detection",
                description="Identifies unusual spending spikes or drops requiring operator attention.",
            ),
        ],
    ),
    AgentProfile(
        id="study",
        name="Study Agent",
        role="Knowledge Acquisition",
        status="active",
        priority=3,
        memory_context_enabled=True,
        description=(
            "Tracks learning objectives, optimises spaced-repetition schedules, "
            "and synthesises new material against existing knowledge maps."
        ),
        capabilities=[
            AgentCapability(
                id="learning_tracking",
                label="Learning Tracking",
                description="Monitors progress against declared learning objectives and study goals.",
            ),
            AgentCapability(
                id="spaced_repetition",
                label="Spaced Repetition",
                description="Recommends review intervals based on retention curves for studied material.",
            ),
            AgentCapability(
                id="knowledge_synthesis",
                label="Knowledge Synthesis",
                description="Connects new concepts to the operator's existing knowledge base.",
            ),
            AgentCapability(
                id="progress_monitoring",
                label="Progress Monitoring",
                description="Reports weekly study velocity and flags stalled learning tracks.",
            ),
            AgentCapability(
                id="resource_curation",
                label="Resource Curation",
                description="Surfaces relevant resources aligned with active learning interests.",
            ),
        ],
    ),
    AgentProfile(
        id="health",
        name="Health Agent",
        role="Biometric Operations",
        status="standby",
        priority=4,
        memory_context_enabled=False,
        description=(
            "Integrates sleep, activity, and nutrition data to surface recovery "
            "status and recommend protocol adjustments for peak performance."
        ),
        capabilities=[
            AgentCapability(
                id="recovery_analysis",
                label="Recovery Analysis",
                description="Assesses training load vs recovery balance using biometric inputs.",
            ),
            AgentCapability(
                id="protocol_recommendations",
                label="Protocol Recommendations",
                description="Suggests adjustments to sleep, nutrition, and training protocols.",
            ),
            AgentCapability(
                id="sleep_tracking",
                label="Sleep Tracking",
                description="Monitors sleep quality trends and correlates with performance metrics.",
            ),
            AgentCapability(
                id="activity_monitoring",
                label="Activity Monitoring",
                description="Tracks daily movement, training sessions, and sedentary time.",
            ),
            AgentCapability(
                id="nutrition_guidance",
                label="Nutrition Guidance",
                description="Aligns macronutrient targets with active training and recovery phases.",
            ),
        ],
    ),
    AgentProfile(
        id="career",
        name="Career Agent",
        role="Professional Development",
        status="active",
        priority=5,
        memory_context_enabled=True,
        description=(
            "Maps skill gaps against target roles, tracks networking momentum, "
            "and identifies leverage points for accelerating career trajectory."
        ),
        capabilities=[
            AgentCapability(
                id="skill_gap_analysis",
                label="Skill Gap Analysis",
                description="Compares current skills against requirements of declared target roles.",
            ),
            AgentCapability(
                id="network_tracking",
                label="Network Tracking",
                description="Monitors relationship-building momentum and flags stalled connections.",
            ),
            AgentCapability(
                id="role_alignment",
                label="Role Alignment",
                description="Evaluates whether daily work aligns with declared career trajectory.",
            ),
            AgentCapability(
                id="opportunity_identification",
                label="Opportunity Identification",
                description="Surfaces high-leverage opportunities based on current skill and network profile.",
            ),
            AgentCapability(
                id="trajectory_planning",
                label="Trajectory Planning",
                description="Builds 6–18 month career roadmaps with actionable milestones.",
            ),
        ],
    ),
]

# Fast lookup by id — built once at module load.
_AGENTS_BY_ID: dict[str, AgentProfile] = {a.id: a for a in _AGENTS}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=AgentsResponse)
def list_agents(_: User = Depends(get_current_user)) -> AgentsResponse:
    return AgentsResponse(agents=_AGENTS)


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AgentDetail:
    agent = _AGENTS_BY_ID.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")

    # Build user-specific context summary. All queries scoped to current_user.id.
    total_memories: int = db.execute(
        select(func.count()).select_from(AIMemory).where(AIMemory.user_id == current_user.id)
    ).scalar_one()

    active_goal_count: int = db.execute(
        select(func.count())
        .select_from(Goal)
        .where(Goal.user_id == current_user.id, Goal.status == "active")
    ).scalar_one()

    context_summary = AgentContextSummary(
        total_memories=total_memories,
        active_goal_count=active_goal_count,
        has_context=(total_memories > 0 or active_goal_count > 0),
    )

    return AgentDetail(**agent.model_dump(), context_summary=context_summary)
