import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.ai.context_service import ContextScope, build_context
from app.ai.factory import get_ai_provider
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.autonomy import AutonomyAuditLog, AutonomyQueueItem, AutonomyRule as AutonomyRuleModel
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.schemas.ai import CreateGoalPayload, CreateTaskPayload, UpdateTaskStatusPayload
from app.schemas.autonomy import (
    AutonomyAuditLogListResponse,
    AutonomyAuditLogOut,
    AutonomyExecuteResult,
    AutonomyQueueItemCreate,
    AutonomyQueueItemOut,
    AutonomyQueueListResponse,
    AutonomyQueueStatusUpdate,
    AutonomyRuleCreate,
    AutonomyRuleOut,
    AutonomyRulesResponse,
    AutonomyRuleUpdate,
    DailyPlan,
    DailyPlanRequest,
    GeneratePlanPayload,
    SuggestionsResponse,
    _SAFE_AUTONOMY_ACTIONS,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_VALID_STATUSES = {"pending", "approved", "rejected", "completed"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rule_to_out(rule: AutonomyRuleModel) -> AutonomyRuleOut:
    return AutonomyRuleOut(
        id=rule.id,
        user_id=rule.user_id,
        action_type=rule.action_type,
        risk_level=rule.risk_level,
        requires_manual_approval=rule.requires_manual_approval,
        allow_execution=rule.allow_execution,
        notes=rule.notes,
        created_at=rule.created_at.isoformat(),
        updated_at=rule.updated_at.isoformat(),
    )


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


def _audit_to_out(entry: AutonomyAuditLog) -> AutonomyAuditLogOut:
    return AutonomyAuditLogOut(
        id=entry.id,
        user_id=entry.user_id,
        event_type=entry.event_type,
        source=entry.source,
        related_queue_item_id=entry.related_queue_item_id,
        action_type=entry.action_type,
        risk_level=entry.risk_level,
        message=entry.message,
        metadata=entry.audit_metadata,
        created_at=entry.created_at.isoformat(),
    )


def _record_audit(
    db: Session,
    user_id: str,
    event_type: str,
    message: str,
    *,
    source: str = "helios",
    related_queue_item_id: str | None = None,
    action_type: str | None = None,
    risk_level: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Write an audit log entry. Silently swallows errors so the main request is never affected."""
    try:
        entry = AutonomyAuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            event_type=event_type,
            source=source,
            related_queue_item_id=related_queue_item_id,
            action_type=action_type,
            risk_level=risk_level,
            message=message,
            audit_metadata=metadata or {},
            created_at=datetime.now(timezone.utc),
        )
        db.add(entry)
        db.commit()
    except Exception:
        logger.exception("Failed to write autonomy audit log entry (event=%s, user=%s)", event_type, user_id)
        try:
            db.rollback()
        except Exception:
            pass


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

    _record_audit(
        db,
        current_user.id,
        "suggestion_created",
        f"{len(trimmed)} suggestion(s) generated.",
        metadata={"count": len(trimmed)},
    )

    return SuggestionsResponse(
        suggestions=trimmed,
        total=len(trimmed),
        generated_at=now,
    )


# ── Daily plan ────────────────────────────────────────────────────────────────

@router.post("/daily-plan", response_model=DailyPlan)
def generate_daily_plan(
    payload: DailyPlanRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyPlan:
    """
    Generate a structured daily operational plan for the authenticated operator.

    The plan is ephemeral — not stored in the database. It includes focus blocks,
    priority tasks, risks, recommended agent actions, and suggested queue items
    the operator can review and promote to the autonomy queue.
    No automatic execution occurs.
    """
    plan_date = (payload.target_date if payload and payload.target_date else None) or date.today().isoformat()

    planning_ctx = build_context(
        ContextScope.PLANNING,
        user_id=current_user.id,
        db=db,
        user_name=current_user.name,
    )

    try:
        plan = get_ai_provider().generate_daily_plan(
            user_name=current_user.name,
            plan_date=plan_date,
            user_context=planning_ctx.text,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return plan


# ── Approval rules ────────────────────────────────────────────────────────────

@router.get("/rules", response_model=AutonomyRulesResponse)
def list_rules(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyRulesResponse:
    """Return all approval rules for the authenticated operator."""
    rows = db.execute(
        select(AutonomyRuleModel)
        .where(AutonomyRuleModel.user_id == current_user.id)
        .order_by(AutonomyRuleModel.action_type, AutonomyRuleModel.risk_level)
    ).scalars().all()
    return AutonomyRulesResponse(rules=[_rule_to_out(r) for r in rows], total=len(rows))


@router.post("/rules", response_model=AutonomyRuleOut, status_code=201)
def create_rule(
    payload: AutonomyRuleCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyRuleOut:
    """
    Create an approval rule for a given action type and optional risk level.

    Rules with risk_level=None act as wildcards covering all risk levels.
    Duplicate (action_type, risk_level) combinations per user are rejected with 409.
    """
    # Enforce uniqueness application-side to handle NULL risk_level correctly across
    # all databases (SQL UNIQUE constraints treat NULL ≠ NULL, allowing duplicates).
    existing_q = select(AutonomyRuleModel).where(
        AutonomyRuleModel.user_id == current_user.id,
        AutonomyRuleModel.action_type == payload.action_type,
    )
    if payload.risk_level is None:
        existing_q = existing_q.where(AutonomyRuleModel.risk_level.is_(None))
    else:
        existing_q = existing_q.where(AutonomyRuleModel.risk_level == payload.risk_level)

    if db.execute(existing_q).scalar_one_or_none():
        rl = payload.risk_level or "any"
        raise HTTPException(
            status_code=409,
            detail=(
                f"A rule already exists for action_type='{payload.action_type}', "
                f"risk_level='{rl}'. Update or delete it before creating a new one."
            ),
        )

    now = datetime.now(timezone.utc)
    rule = AutonomyRuleModel(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        action_type=payload.action_type,
        risk_level=payload.risk_level,
        requires_manual_approval=payload.requires_manual_approval,
        allow_execution=payload.allow_execution,
        notes=payload.notes,
        created_at=now,
        updated_at=now,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_to_out(rule)


@router.patch("/rules/{rule_id}", response_model=AutonomyRuleOut)
def update_rule(
    rule_id: str,
    payload: AutonomyRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyRuleOut:
    rule = db.execute(
        select(AutonomyRuleModel).where(
            AutonomyRuleModel.id == rule_id,
            AutonomyRuleModel.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found.")

    if payload.requires_manual_approval is not None:
        rule.requires_manual_approval = payload.requires_manual_approval
    if payload.allow_execution is not None:
        rule.allow_execution = payload.allow_execution
    # Use model_fields_set so passing notes=None explicitly clears the field.
    if "notes" in payload.model_fields_set:
        rule.notes = payload.notes

    rule.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rule)
    return _rule_to_out(rule)


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    rule = db.execute(
        select(AutonomyRuleModel).where(
            AutonomyRuleModel.id == rule_id,
            AutonomyRuleModel.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found.")

    db.delete(rule)
    db.commit()


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

    _record_audit(
        db,
        current_user.id,
        "queue_item_created",
        f'Queue item "{item.title}" added for review.',
        related_queue_item_id=item.id,
        action_type=item.proposed_action_type,
        risk_level=item.risk_level,
        metadata={"source_agent": item.source_agent, "title": item.title},
    )

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

    if payload.status == "approved":
        _record_audit(
            db,
            current_user.id,
            "queue_item_approved",
            f'Queue item "{item.title}" approved.',
            related_queue_item_id=item.id,
            action_type=item.proposed_action_type,
            risk_level=item.risk_level,
            metadata={"title": item.title},
        )
    elif payload.status == "rejected":
        _record_audit(
            db,
            current_user.id,
            "queue_item_rejected",
            f'Queue item "{item.title}" rejected.',
            related_queue_item_id=item.id,
            action_type=item.proposed_action_type,
            risk_level=item.risk_level,
            metadata={"title": item.title},
        )

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

    # ── Check approval rules ──────────────────────────────────────────────────
    # Look for any rule that explicitly blocks execution for this action_type
    # at this item's specific risk level OR at any risk level (wildcard).
    # Specific rules (non-null risk_level) take priority via nullslast ordering,
    # but we only care whether ANY matching rule has allow_execution=False.
    blocking_rule = db.execute(
        select(AutonomyRuleModel)
        .where(
            AutonomyRuleModel.user_id == current_user.id,
            AutonomyRuleModel.action_type == item.proposed_action_type,
            or_(
                AutonomyRuleModel.risk_level == item.risk_level,
                AutonomyRuleModel.risk_level.is_(None),
            ),
            AutonomyRuleModel.allow_execution.is_(False),
        )
        .limit(1)
    ).scalar_one_or_none()

    if blocking_rule:
        detail = blocking_rule.notes or (
            f"Execution blocked by approval rule for "
            f"'{item.proposed_action_type}' "
            f"({'any risk level' if blocking_rule.risk_level is None else blocking_rule.risk_level + ' risk'}). "
            "Update or remove the rule to allow execution."
        )
        _record_audit(
            db,
            current_user.id,
            "execution_blocked_by_rule",
            f'Execution of "{item.title}" blocked by approval rule.',
            related_queue_item_id=item.id,
            action_type=item.proposed_action_type,
            risk_level=item.risk_level,
            metadata={
                "rule_id": blocking_rule.id,
                "rule_risk_level": blocking_rule.risk_level,
                "title": item.title,
            },
        )
        raise HTTPException(status_code=403, detail=detail)

    now = datetime.now(timezone.utc)

    # ── create_task ──────────────────────────────────────────────────────────
    if item.proposed_action_type == "create_task":
        try:
            task_data = CreateTaskPayload.model_validate(item.payload_preview)
        except ValidationError as exc:
            _record_audit(
                db,
                current_user.id,
                "execution_failed",
                f'Execution of "{item.title}" failed: payload validation error.',
                related_queue_item_id=item.id,
                action_type=item.proposed_action_type,
                risk_level=item.risk_level,
                metadata={"error": "payload_validation_error", "title": item.title},
            )
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

        _record_audit(
            db,
            current_user.id,
            "queue_item_executed",
            f'Task "{task.title}" created via autonomy execution.',
            related_queue_item_id=item_id,
            action_type="create_task",
            risk_level=item.risk_level,
            metadata={"created_id": task.id, "title": task.title},
        )

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
            _record_audit(
                db,
                current_user.id,
                "execution_failed",
                f'Execution of "{item.title}" failed: payload validation error.',
                related_queue_item_id=item.id,
                action_type=item.proposed_action_type,
                risk_level=item.risk_level,
                metadata={"error": "payload_validation_error", "title": item.title},
            )
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

        _record_audit(
            db,
            current_user.id,
            "queue_item_executed",
            f'Goal "{goal.title}" created via autonomy execution.',
            related_queue_item_id=item_id,
            action_type="create_goal",
            risk_level=item.risk_level,
            metadata={"created_id": goal.id, "title": goal.title},
        )

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
            _record_audit(
                db,
                current_user.id,
                "execution_failed",
                f'Execution of "{item.title}" failed: payload validation error.',
                related_queue_item_id=item.id,
                action_type=item.proposed_action_type,
                risk_level=item.risk_level,
                metadata={"error": "payload_validation_error", "title": item.title},
            )
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

        _record_audit(
            db,
            current_user.id,
            "queue_item_executed",
            f'Task "{task.title}" status updated to "{update_data.status}" via autonomy execution.',
            related_queue_item_id=item_id,
            action_type="update_task_status",
            risk_level=item.risk_level,
            metadata={"updated_id": task.id, "new_status": update_data.status, "title": task.title},
        )

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
            _record_audit(
                db,
                current_user.id,
                "execution_failed",
                f'Execution of "{item.title}" failed: payload validation error.',
                related_queue_item_id=item.id,
                action_type=item.proposed_action_type,
                risk_level=item.risk_level,
                metadata={"error": "payload_validation_error", "title": item.title},
            )
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
            _record_audit(
                db,
                current_user.id,
                "execution_failed",
                f'Execution of "{item.title}" failed: AI provider error.',
                related_queue_item_id=item.id,
                action_type=item.proposed_action_type,
                risk_level=item.risk_level,
                metadata={"error": "ai_provider_error", "title": item.title},
            )
            raise HTTPException(status_code=502, detail=str(exc))

        item.status = "completed"
        item.updated_at = now
        db.commit()

        _record_audit(
            db,
            current_user.id,
            "queue_item_executed",
            f'Plan "{plan.plan_title}" generated via autonomy execution.',
            related_queue_item_id=item_id,
            action_type="generate_plan",
            risk_level=item.risk_level,
            metadata={"plan_title": plan.plan_title, "title": item.title},
        )

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


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit-log", response_model=AutonomyAuditLogListResponse)
def get_audit_log(
    limit: int = Query(default=50, ge=1, le=200, description="Number of entries to return"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyAuditLogListResponse:
    """Return recent autonomy audit log entries for the authenticated operator."""
    rows = db.execute(
        select(AutonomyAuditLog)
        .where(AutonomyAuditLog.user_id == current_user.id)
        .order_by(AutonomyAuditLog.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    return AutonomyAuditLogListResponse(
        entries=[_audit_to_out(r) for r in rows],
        total=len(rows),
    )
