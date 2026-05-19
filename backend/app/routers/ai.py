from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.user import User
from app.schemas.ai import BriefingPriority, DailyBriefing, PlanRequest, PlanResponse, PlanStep

router = APIRouter()


# ── Mock planner ──────────────────────────────────────────────────────────────
# Swap _generate_mock_plan body for an LLM call (OpenAI, Ollama, etc.) in a
# future phase. The endpoint, auth, and response schema do not change.

def _generate_mock_plan(
    prompt: str,
    horizon: int,
    goal_title: str | None,
    user_name: str,
) -> PlanResponse:
    context = goal_title or prompt[:60]

    if horizon <= 7:
        phases = [
            ("Foundation",  max(1, horizon // 3)),
            ("Execution",   max(2, (horizon * 2) // 3)),
            ("Completion",  horizon),
        ]
    elif horizon <= 14:
        phases = [
            ("Discovery",   max(1, horizon // 4)),
            ("Foundation",  max(2, horizon // 2)),
            ("Build",       max(3, (horizon * 3) // 4)),
            ("Validate",    horizon),
        ]
    elif horizon <= 30:
        phases = [
            ("Research & Planning", max(1,  horizon // 5)),
            ("Foundation",          max(2, (horizon * 2) // 5)),
            ("Core Build",          max(3, (horizon * 3) // 5)),
            ("Integration",         max(4, (horizon * 4) // 5)),
            ("Review & Ship",       horizon),
        ]
    else:
        phases = [
            ("Scoping & Research",  max(1,  horizon // 7)),
            ("Architecture",        max(2, (horizon * 2) // 7)),
            ("Core Development",    max(3, (horizon * 3) // 7)),
            ("Integration",         max(4, (horizon * 4) // 7)),
            ("Testing",             max(5, (horizon * 5) // 7)),
            ("Refinement",          max(6, (horizon * 6) // 7)),
            ("Launch",              horizon),
        ]

    steps = [
        PlanStep(
            step_number=i + 1,
            title=name,
            description=(
                f"Complete {name.lower()} activities for '{context}'. "
                "Define clear success criteria before moving to the next phase "
                "and surface any blockers early."
            ),
            day_target=day,
        )
        for i, (name, day) in enumerate(phases)
    ]

    return PlanResponse(
        plan_title=f"Execution Plan: {context}",
        summary=(
            f"A structured {horizon}-day plan addressing: {prompt} "
            f"This plan breaks the objective into {len(steps)} sequential phases, "
            "each building on the previous to ensure consistent forward momentum. "
            f"Operator {user_name} — review priorities and adjust before execution."
        ),
        steps=steps,
        estimated_timeline=f"{horizon} days",
        risks=[
            "Scope creep — stay anchored to the original objective as new ideas emerge.",
            "Missed dependencies — validate external blockers before starting each phase.",
            f"Timeline pressure — a {horizon}-day commitment requires daily progress to stay on track.",
        ],
        recommendation=(
            f"Begin immediately with Phase 1. Allocate dedicated focus blocks — "
            f"even 30–45 minutes daily compounds significantly over {horizon} days. "
            "Review this plan at the midpoint and adjust steps if the context has shifted."
        ),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/plan", response_model=PlanResponse)
def generate_plan(
    payload: PlanRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PlanResponse:
    goal_title: str | None = None
    if payload.goal_id:
        goal = db.execute(
            select(Goal).where(Goal.id == payload.goal_id, Goal.user_id == current_user.id)
        ).scalar_one_or_none()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found.")
        goal_title = goal.title

    return _generate_mock_plan(
        prompt=payload.prompt,
        horizon=payload.planning_horizon_days,
        goal_title=goal_title,
        user_name=current_user.name,
    )


@router.get("/briefing", response_model=DailyBriefing)
def get_daily_briefing(current_user: User = Depends(get_current_user)) -> DailyBriefing:
    # current_user is available here for personalisation once an LLM is wired in.
    return DailyBriefing(
        summary=(
            f"Good session, {current_user.name}. Operational profile shows strong technical "
            "momentum across all systems. Authentication architecture reached a significant "
            "milestone with JWT integration. System stability is nominal. "
            "Engineering velocity is high — maintain current cadence for optimal output."
        ),
        priorities=[
            BriefingPriority(
                label="Complete Phase 12 AI integration",
                detail="Finalize the briefing pipeline and validate all protected endpoints end-to-end.",
            ),
            BriefingPriority(
                label="Review JWT token lifecycle",
                detail="Audit expiry windows and prepare the refresh token architecture for Phase 13.",
            ),
            BriefingPriority(
                label="Commit all backend milestones",
                detail="Ensure Phases 9–12 are committed and documented before the next sprint.",
            ),
        ],
        risks=[
            "Access tokens expire after 60 minutes — implement refresh tokens to prevent session loss.",
            "Dashboard metrics are currently static — live data requires user activity tracking.",
        ],
        recommendation=(
            "Sustain current sprint velocity. The authentication and database layers are "
            "production-ready. Phase 13 refresh tokens will complete the security foundation "
            "and unlock persistent sessions for all operators."
        ),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
