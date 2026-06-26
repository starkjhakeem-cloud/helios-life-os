"""
Task/Goal/Calendar Relationship API endpoints.

All routes are authenticated and user-scoped. Business logic lives in
TaskGoalCalendarService — this router is a thin HTTP translation layer.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.relationships import (
    AssignTasksRequest,
    FocusBlockCreate,
    FocusBlockOut,
    FocusBlockStatusUpdate,
    GoalProgressResponse,
    LinkGoalRequest,
    NextBestActionResponse,
    RelationshipHealthResponse,
    ScheduleTaskRequest,
    ScheduleTaskResponse,
    TaskRelationshipOut,
    TimeWindow,
)
from app.services.task_goal_calendar_service import (
    RelationshipError,
    TaskGoalCalendarService,
)

router = APIRouter()

# Error code → HTTP status map
_ERROR_STATUS: dict[str, int] = {
    "task_not_found":              404,
    "invalid_status_transition":   422,
    "goal_not_found":            404,
    "focus_block_not_found":     404,
    "permission_denied":         403,
    "calendar_conflict":         409,
    "invalid_time_range":        422,
    "relationship_already_exists": 409,
    "no_linked_goal":            422,
}


def _handle(exc: RelationshipError) -> HTTPException:
    http_status = _ERROR_STATUS.get(exc.code, 400)
    return HTTPException(
        status_code=http_status,
        detail={"error": exc.code, "detail": exc.detail},
    )


def _svc(db: Session) -> TaskGoalCalendarService:
    return TaskGoalCalendarService(db)


# ── Next Best Action ───────────────────────────────────────────────────────────

@router.get("/next-best-action", response_model=NextBestActionResponse)
def next_best_action(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NextBestActionResponse:
    """Return the single most valuable next action for this user."""
    result = _svc(db).get_next_best_action(current_user.id)
    return NextBestActionResponse(**result)


# ── Available time windows ─────────────────────────────────────────────────────

@router.get("/available-windows", response_model=list[TimeWindow])
def available_windows(
    date_param: date = Query(
        default=None,
        alias="date",
        description="YYYY-MM-DD. Defaults to today.",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TimeWindow]:
    """Return open time windows on a given date."""
    target = date_param or date.today()
    windows = _svc(db).find_available_time_windows(current_user.id, target)
    return [TimeWindow(**w) for w in windows]


# ── Task ↔ Goal ────────────────────────────────────────────────────────────────

@router.post(
    "/tasks/{task_id}/link-goal",
    response_model=TaskRelationshipOut,
    status_code=status.HTTP_200_OK,
)
def link_task_to_goal(
    task_id: str,
    payload: LinkGoalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskRelationshipOut:
    """Link a task to a goal. Optionally sets a project category label."""
    try:
        result = _svc(db).link_task_to_goal(
            current_user.id,
            task_id,
            payload.goal_id,
            category=payload.category,
        )
    except RelationshipError as exc:
        raise _handle(exc)
    return TaskRelationshipOut(**result)


@router.delete(
    "/tasks/{task_id}/link-goal",
    response_model=TaskRelationshipOut,
    status_code=status.HTTP_200_OK,
)
def unlink_task_from_goal(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskRelationshipOut:
    """Remove a task's goal association."""
    try:
        result = _svc(db).unlink_task_from_goal(current_user.id, task_id)
    except RelationshipError as exc:
        raise _handle(exc)
    return TaskRelationshipOut(**result)


# ── Task scheduling ────────────────────────────────────────────────────────────

@router.post(
    "/tasks/{task_id}/schedule",
    response_model=ScheduleTaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def schedule_task(
    task_id: str,
    payload: ScheduleTaskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScheduleTaskResponse:
    """Schedule a task into a calendar time block."""
    try:
        result = _svc(db).schedule_task(
            current_user.id,
            task_id,
            payload.start_time,
            payload.end_time,
        )
    except RelationshipError as exc:
        raise _handle(exc)
    return ScheduleTaskResponse(
        task=TaskRelationshipOut(**result["task"]),
        calendar_event=result["calendar_event"],
    )


@router.delete(
    "/tasks/{task_id}/schedule",
    response_model=TaskRelationshipOut,
    status_code=status.HTTP_200_OK,
)
def unschedule_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskRelationshipOut:
    """Remove a task's scheduled time block."""
    try:
        result = _svc(db).unschedule_task(current_user.id, task_id)
    except RelationshipError as exc:
        raise _handle(exc)
    return TaskRelationshipOut(**result)


# ── Focus blocks ───────────────────────────────────────────────────────────────

@router.post(
    "/focus-blocks",
    response_model=FocusBlockOut,
    status_code=status.HTTP_201_CREATED,
)
def create_focus_block(
    payload: FocusBlockCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FocusBlockOut:
    """Create a focus block and mirror it on the calendar."""
    try:
        result = _svc(db).create_focus_block(
            current_user.id,
            title=payload.title,
            start_time=payload.start_time,
            end_time=payload.end_time,
            linked_goal_id=payload.linked_goal_id,
            task_ids=payload.task_ids,
            source=payload.source,
            notes=payload.notes,
        )
    except RelationshipError as exc:
        raise _handle(exc)
    return FocusBlockOut(**result)


@router.post(
    "/focus-blocks/{focus_block_id}/assign-tasks",
    response_model=FocusBlockOut,
    status_code=status.HTTP_200_OK,
)
def assign_tasks_to_focus_block(
    focus_block_id: str,
    payload: AssignTasksRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FocusBlockOut:
    """Assign (or replace) the set of tasks in a focus block."""
    try:
        result = _svc(db).assign_tasks_to_focus_block(
            current_user.id,
            focus_block_id,
            payload.task_ids,
        )
    except RelationshipError as exc:
        raise _handle(exc)
    return FocusBlockOut(**result)


@router.post(
    "/focus-blocks/{focus_block_id}/start",
    response_model=FocusBlockOut,
    status_code=status.HTTP_200_OK,
)
def start_focus_block(
    focus_block_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FocusBlockOut:
    """
    Transition a focus block from planned → in_progress.

    Records actual_start at the moment the request is received.
    Returns 422 if the block is already in_progress, completed, or cancelled.
    """
    try:
        result = _svc(db).start_focus_block(current_user.id, focus_block_id)
    except RelationshipError as exc:
        raise _handle(exc)
    return FocusBlockOut(**result)


@router.patch(
    "/focus-blocks/{focus_block_id}/status",
    response_model=FocusBlockOut,
    status_code=status.HTTP_200_OK,
)
def update_focus_block_status(
    focus_block_id: str,
    payload: FocusBlockStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FocusBlockOut:
    """
    Transition a focus block to a new status.

    Valid transitions::

        planned     → in_progress | cancelled
        in_progress → planned | completed | cancelled
        completed   → (terminal, 422)
        cancelled   → (terminal, 422)

    Sets actual_start on in_progress entry, actual_end on completed.
    Resets both when returning to planned.
    """
    try:
        result = _svc(db).update_focus_block_status(
            current_user.id, focus_block_id, payload.status
        )
    except RelationshipError as exc:
        raise _handle(exc)
    return FocusBlockOut(**result)


# ── Goal progress ──────────────────────────────────────────────────────────────

@router.get("/goals/{goal_id}/progress", response_model=GoalProgressResponse)
def goal_progress(
    goal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoalProgressResponse:
    """Return goal completion derived from linked tasks."""
    try:
        result = _svc(db).calculate_goal_progress_from_tasks(current_user.id, goal_id)
    except RelationshipError as exc:
        raise _handle(exc)
    return GoalProgressResponse(**result)


# ── Relationship health ────────────────────────────────────────────────────────

@router.get("/health", response_model=RelationshipHealthResponse)
def relationship_health(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RelationshipHealthResponse:
    """Return a structured diagnostics report across all relationship types."""
    result = _svc(db).get_relationship_health(current_user.id)
    return RelationshipHealthResponse(**result)
