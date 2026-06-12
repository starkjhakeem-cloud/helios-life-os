import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.context_service import ContextScope, build_context
from app.ai.factory import get_ai_provider
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.autonomy import AutonomyQueueItem
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.schemas.ai import CreateGoalPayload, CreateTaskPayload, UpdateTaskStatusPayload
from app.schemas.autonomy import (
    AutonomyExecuteResult,
    AutonomyQueueItemCreate,
    AutonomyQueueItemOut,
    AutonomyQueueListResponse,
    AutonomyQueueStatusUpdate,
    GeneratePlanPayload,
    SuggestionsResponse,
    _SAFE_AUTONOMY_ACTIONS,
)

router = APIRouter()

_VALID_STATUSES = {"pending", "approved", "rejected", "completed"}


def _to_out(item: AutonomyQueueItem) -> AutonomyQueueItemOut:
    return AutonomyQueueItemOut(
        id=item.id,
        user_id=item.user_id,
        title=item.title,
        description=item.description,
        source_agent=item.source_agent,
        proposed_action_type=item.proposed_action_type,
        payload_preview=item.payload_preview,
        risk_level=item.risk_level,
        status=item.status,
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
    )


# ── Proactive suggestions ─────────────────────────────────────────────────────

@router.get("/suggestions", response_model=SuggestionsResponse)
def get_suggestions(
    limit: int = Query(default=5, ge=1, le=10, description="Maximum number of suggestions to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuggestionsResponse:
    """
    Generate proactive planning suggestions from the operator's unified context.
    Suggestions are ephemeral — not stored in the database.
    Call POST /queue to promote a suggestion into the review queue.
    """
    planning_ctx = build_context(
        ContextScope.PLANNING,
        user_id=current_user.id,
        db=db,
        user_name=current_user.name,
    )

    try:
        suggestions = get_ai_provider().generate_suggestions(
            user_name=current_user.name,
            user_context=planning_ctx.text,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    now = datetime.now(timezone.utc).isoformat()
    trimmed = suggestions[:limit]
    return SuggestionsResponse(
        suggestions=trimmed,
        total=len(trimmed),
        generated_at=now,
    )


# ── Queue CRUD ────────────────────────────────────────────────────────────────

@router.get("/queue", response_model=AutonomyQueueListResponse)
def list_queue(
    status: str | None = Query(default=None, description="Filter by status: pending | approved | rejected | completed"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyQueueListResponse:
    if status and status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid values: {', '.join(sorted(_VALID_STATUSES))}",
        )

    query = select(AutonomyQueueItem).where(AutonomyQueueItem.user_id == current_user.id)
    if status:
        query = query.where(AutonomyQueueItem.status == status)
    query = query.order_by(AutonomyQueueItem.created_at.desc())

    rows = db.execute(query).scalars().all()
    return AutonomyQueueListResponse(items=[_to_out(r) for r in rows], total=len(rows))


@router.post("/queue", response_model=AutonomyQueueItemOut, status_code=201)
def create_queue_item(
    payload: AutonomyQueueItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyQueueItemOut:
    now = datetime.now(timezone.utc)
    item = AutonomyQueueItem(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        source_agent=payload.source_agent,
        proposed_action_type=payload.proposed_action_type,
        payload_preview=payload.payload_preview,
        risk_level=payload.risk_level,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.patch("/queue/{item_id}", response_model=AutonomyQueueItemOut)
def update_queue_item_status(
    item_id: str,
    payload: AutonomyQueueStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyQueueItemOut:
    item = db.execute(
        select(AutonomyQueueItem).where(
            AutonomyQueueItem.id == item_id,
            AutonomyQueueItem.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found.")

    item.status = payload.status
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.delete("/queue/{item_id}", status_code=204)
def delete_queue_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    item = db.execute(
        select(AutonomyQueueItem).where(
            AutonomyQueueItem.id == item_id,
            AutonomyQueueItem.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found.")

    db.delete(item)
    db.commit()


# ── Execution bridge ──────────────────────────────────────────────────────────

@router.post("/queue/{item_id}/execute", response_model=AutonomyExecuteResult)
def execute_queue_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyExecuteResult:
    """
    Execute an approved autonomy queue item.

    The item must be in 'approved' status. Only safe, non-destructive action types
    are accepted. The queue item is marked 'completed' only after successful execution.
    Failed executions leave the item in 'approved' so the operator can retry or reject.
    No automatic or background execution — this endpoint requires an explicit user request.
    """
    item = db.execute(
        select(AutonomyQueueItem).where(
            AutonomyQueueItem.id == item_id,
            AutonomyQueueItem.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found.")

    if item.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Queue item must be 'approved' to execute. Current status: '{item.status}'.",
        )

    if item.proposed_action_type not in _SAFE_AUTONOMY_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Action type '{item.proposed_action_type}' is not supported for execution. "
                f"Supported: {', '.join(sorted(_SAFE_AUTONOMY_ACTIONS))}"
            ),
        )

    now = datetime.now(timezone.utc)

    # ── create_task ──────────────────────────────────────────────────────────
    if item.proposed_action_type == "create_task":
        try:
            task_data = CreateTaskPayload.model_validate(item.payload_preview)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors())

        if task_data.linked_goal_id:
            linked_goal = db.execute(
                select(Goal).where(
                    Goal.id == task_data.linked_goal_id,
                    Goal.user_id == current_user.id,
                )
            ).scalar_one_or_none()
            if not linked_goal:
                raise HTTPException(status_code=404, detail="Linked goal not found.")

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
        item.status = "completed"
        item.updated_at = now
        db.commit()

        return AutonomyExecuteResult(
            success=True,
            action_type="create_task",
            message=f'Task "{task.title}" created successfully.',
            queue_item_id=item_id,
            created_or_updated_id=task.id,
            executed_at=now.isoformat(),
        )

    # ── create_goal ──────────────────────────────────────────────────────────
    if item.proposed_action_type == "create_goal":
        try:
            goal_data = CreateGoalPayload.model_validate(item.payload_preview)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors())

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
        item.status = "completed"
        item.updated_at = now
        db.commit()

        return AutonomyExecuteResult(
            success=True,
            action_type="create_goal",
            message=f'Goal "{goal.title}" created successfully.',
            queue_item_id=item_id,
            created_or_updated_id=goal.id,
            executed_at=now.isoformat(),
        )

    # ── update_task_status ───────────────────────────────────────────────────
    if item.proposed_action_type == "update_task_status":
        try:
            update_data = UpdateTaskStatusPayload.model_validate(item.payload_preview)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors())

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
        item.status = "completed"
        item.updated_at = now
        db.commit()

        return AutonomyExecuteResult(
            success=True,
            action_type="update_task_status",
            message=f'Task "{task.title}" marked as {update_data.status.replace("_", " ")}.',
            queue_item_id=item_id,
            created_or_updated_id=task.id,
            executed_at=now.isoformat(),
        )

    # ── generate_plan ────────────────────────────────────────────────────────
    if item.proposed_action_type == "generate_plan":
        try:
            plan_data = GeneratePlanPayload.model_validate(item.payload_preview)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors())

        goal_title: str | None = None
        if plan_data.goal_id:
            plan_goal = db.execute(
                select(Goal).where(
                    Goal.id == plan_data.goal_id,
                    Goal.user_id == current_user.id,
                )
            ).scalar_one_or_none()
            if not plan_goal:
                raise HTTPException(status_code=404, detail="Goal not found.")
            goal_title = plan_goal.title

        planning_ctx = build_context(
            ContextScope.PLANNING,
            user_id=current_user.id,
            db=db,
            user_name=current_user.name,
        )

        try:
            plan = get_ai_provider().generate_plan(
                prompt=plan_data.prompt,
                horizon=plan_data.planning_horizon_days,
                goal_title=goal_title,
                user_name=current_user.name,
                user_context=planning_ctx.text,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

        item.status = "completed"
        item.updated_at = now
        db.commit()

        return AutonomyExecuteResult(
            success=True,
            action_type="generate_plan",
            message=f'Plan "{plan.plan_title}" generated successfully.',
            queue_item_id=item_id,
            executed_at=now.isoformat(),
            plan=plan,
        )

    # Unreachable — _SAFE_AUTONOMY_ACTIONS check above guards this path.
    raise HTTPException(status_code=400, detail="Unsupported action type.")
