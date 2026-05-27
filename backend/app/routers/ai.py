from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.context_builder import build_user_context
from app.ai.factory import get_ai_provider
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.user import User
from app.schemas.ai import ChatRequest, ChatResponse, DailyBriefing, PlanRequest, PlanResponse

router = APIRouter()


@router.get("/briefing", response_model=DailyBriefing)
def get_daily_briefing(current_user: User = Depends(get_current_user)) -> DailyBriefing:
    try:
        return get_ai_provider().generate_briefing(user_name=current_user.name)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


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

    try:
        return get_ai_provider().generate_plan(
            prompt=payload.prompt,
            horizon=payload.planning_horizon_days,
            goal_title=goal_title,
            user_name=current_user.name,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ChatResponse:
    # Build live user context only when the client opts in.
    # All queries inside build_user_context are scoped to current_user.id.
    user_context: str | None = None
    if payload.include_context:
        user_context = build_user_context(user_id=current_user.id, db=db)

    try:
        return get_ai_provider().generate_chat_reply(
            message=payload.message,
            user_name=current_user.name,
            context_type=payload.context_type,
            user_context=user_context,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
