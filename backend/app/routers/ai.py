import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.context_builder import build_briefing_context, build_memory_context, build_user_context
from app.ai.factory import get_ai_provider
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.schemas.ai import (
    ActionExecuteRequest,
    ActionExecuteResult,
    ChatRequest,
    ChatResponse,
    CreateGoalPayload,
    CreateTaskPayload,
    DailyBriefing,
    PlanRequest,
    PlanResponse,
    UpdateTaskStatusPayload,
)

router = APIRouter()


@router.get("/briefing/daily", response_model=DailyBriefing)
def get_daily_briefing(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyBriefing:
    # Use the extended briefing context: memory + goals + tasks + analytics + conversations.
    user_context = build_briefing_context(user_id=current_user.id, db=db)
    try:
        return get_ai_provider().generate_briefing(
            user_name=current_user.name,
            user_context=user_context,
        )
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
    # Long-term memories are always injected — they represent who the operator
    # is, not transient operational data. Live goals/tasks are added only when
    # the client opts in via include_context.
    if payload.include_context:
        user_context: str | None = build_user_context(user_id=current_user.id, db=db)
    else:
        user_context = build_memory_context(user_id=current_user.id, db=db)

    try:
        return get_ai_provider().generate_chat_reply(
            message=payload.message,
            user_name=current_user.name,
            context_type=payload.context_type,
            user_context=user_context,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/actions/execute", response_model=ActionExecuteResult)
def execute_action(
    payload: ActionExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActionExecuteResult:
    """
    Execute an AI-recommended action after explicit user confirmation.
    Only safe, non-destructive actions are accepted.
    All created/updated records are scoped to current_user.id — the payload
    may never override ownership.
    """
    now = datetime.now(timezone.utc)

    if payload.action_type == "create_task":
        try:
            task_data = CreateTaskPayload.model_validate(payload.payload)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=exc.errors(),
            )
        # Verify any linked goal belongs to the current user.
        if task_data.linked_goal_id:
            goal = db.execute(
                select(Goal).where(
                    Goal.id == task_data.linked_goal_id,
                    Goal.user_id == current_user.id,
                )
            ).scalar_one_or_none()
            if not goal:
                raise HTTPException(status_code=404, detail="Goal not found.")
        task = Task(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            title=task_data.title,
            description=task_data.description,
            status=task_data.status,
            priority=task_data.priority,
            due_date=task_data.due_date,
            linked_goal_id=task_data.linked_goal_id,
            created_at=now,
            updated_at=now,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return ActionExecuteResult(
            success=True,
            action_type="create_task",
            message=f'Task "{task.title}" created successfully.',
            created_or_updated_id=task.id,
            executed_at=now.isoformat(),
        )

    if payload.action_type == "create_goal":
        try:
            goal_data = CreateGoalPayload.model_validate(payload.payload)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=exc.errors(),
            )
        goal = Goal(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            title=goal_data.title,
            description=goal_data.description,
            status=goal_data.status,
            target_date=goal_data.target_date,
            created_at=now,
            updated_at=now,
        )
        db.add(goal)
        db.commit()
        db.refresh(goal)
        return ActionExecuteResult(
            success=True,
            action_type="create_goal",
            message=f'Goal "{goal.title}" created successfully.',
            created_or_updated_id=goal.id,
            executed_at=now.isoformat(),
        )

    if payload.action_type == "update_task_status":
        try:
            update_data = UpdateTaskStatusPayload.model_validate(payload.payload)
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=exc.errors(),
            )
        # Ownership check: WHERE user_id = current_user.id prevents cross-user access.
        task = db.execute(
            select(Task).where(
                Task.id == update_data.task_id,
                Task.user_id == current_user.id,
            )
        ).scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found.")
        task.status = update_data.status
        task.updated_at = now
        db.commit()
        db.refresh(task)
        return ActionExecuteResult(
            success=True,
            action_type="update_task_status",
            message=f'Task "{task.title}" marked as {update_data.status.replace("_", " ")}.',
            created_or_updated_id=task.id,
            executed_at=now.isoformat(),
        )

    # Unreachable: Pydantic enforces ExecutableActionType at the request boundary.
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported action type: {payload.action_type}",
    )
