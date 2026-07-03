from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.task_engine import (
    AcceptSuggestionRequest,
    AcceptSuggestionResponse,
    BuildDayRequest,
    BuildDayResponse,
    CompleteTaskResponse,
    GenerateTaskSuggestionsRequest,
    RejectSuggestionRequest,
    ScheduleTaskEngineRequest,
    ScheduleTaskEngineResponse,
    SuggestedTasksResponse,
    SuggestionStatus,
    TaskSuggestionOut,
)
from app.schemas.tasks import TaskOut
from app.services.task_engine_service import TaskEngineError, TaskEngineService
from app.services.task_goal_calendar_service import RelationshipError

router = APIRouter()

_ERROR_STATUS: dict[str, int] = {
    "suggestion_not_found": status.HTTP_404_NOT_FOUND,
    "task_not_found": status.HTTP_404_NOT_FOUND,
    "goal_not_found": status.HTTP_404_NOT_FOUND,
    "suggestion_rejected": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "suggestion_accepted": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "invalid_source": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "invalid_date": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "invalid_time_range": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "no_available_window": status.HTTP_409_CONFLICT,
    "calendar_conflict": status.HTTP_409_CONFLICT,
}


def _handle(exc: TaskEngineError | RelationshipError) -> HTTPException:
    code = exc.code
    return HTTPException(
        status_code=_ERROR_STATUS.get(code, status.HTTP_400_BAD_REQUEST),
        detail={"error": code, "detail": exc.detail},
    )


@router.get("/suggestions", response_model=SuggestedTasksResponse)
def list_or_generate_suggestions(
    status_filter: SuggestionStatus = Query(default="pending", alias="status"),
    regenerate: bool = Query(default=True),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuggestedTasksResponse:
    service = TaskEngineService(db)
    if regenerate and status_filter == "pending":
        try:
            payload = service.generate_suggestions(current_user.id, limit=limit)
        except (TaskEngineError, RelationshipError) as exc:
            raise _handle(exc)
        return SuggestedTasksResponse(**payload)
    suggestions = service.list_suggestions(current_user.id, status=status_filter, limit=limit)
    return SuggestedTasksResponse(suggestions=[TaskSuggestionOut(**item) for item in suggestions])


@router.post("/suggestions/generate", response_model=SuggestedTasksResponse)
def generate_suggestions(
    payload: GenerateTaskSuggestionsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SuggestedTasksResponse:
    try:
        result = TaskEngineService(db).generate_suggestions(
            current_user.id,
            sources=payload.sources,
            limit=payload.limit,
        )
    except (TaskEngineError, RelationshipError) as exc:
        raise _handle(exc)
    return SuggestedTasksResponse(**result)


@router.post(
    "/suggestions/{suggestion_id}/accept",
    response_model=AcceptSuggestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def accept_suggestion(
    suggestion_id: str,
    payload: AcceptSuggestionRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AcceptSuggestionResponse:
    request = payload or AcceptSuggestionRequest()
    try:
        result = TaskEngineService(db).accept_suggestion(
            current_user.id,
            suggestion_id,
            schedule=request.schedule,
            schedule_date=request.schedule_date,
            start_time=request.start_time,
            end_time=request.end_time,
        )
    except (TaskEngineError, RelationshipError) as exc:
        raise _handle(exc)
    return AcceptSuggestionResponse(
        suggestion=TaskSuggestionOut(**result["suggestion"]),
        task=TaskOut(**result["task"]),
        calendar_event=result["calendar_event"],
        goal_progress=result["goal_progress"],
    )


@router.post("/suggestions/{suggestion_id}/reject", response_model=TaskSuggestionOut)
def reject_suggestion(
    suggestion_id: str,
    payload: RejectSuggestionRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskSuggestionOut:
    request = payload or RejectSuggestionRequest()
    try:
        result = TaskEngineService(db).reject_suggestion(
            current_user.id,
            suggestion_id,
            reason=request.reason,
        )
    except (TaskEngineError, RelationshipError) as exc:
        raise _handle(exc)
    return TaskSuggestionOut(**result)


@router.post(
    "/tasks/{task_id}/schedule",
    response_model=ScheduleTaskEngineResponse,
    status_code=status.HTTP_201_CREATED,
)
def schedule_task(
    task_id: str,
    payload: ScheduleTaskEngineRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScheduleTaskEngineResponse:
    request = payload or ScheduleTaskEngineRequest()
    try:
        result = TaskEngineService(db).schedule_task(
            current_user.id,
            task_id,
            schedule_date=request.date,
            start_time=request.start_time,
            end_time=request.end_time,
        )
    except (TaskEngineError, RelationshipError) as exc:
        raise _handle(exc)
    return ScheduleTaskEngineResponse(
        task=TaskOut(**result["task"]),
        calendar_event=result["calendar_event"],
        selected_window=result["selected_window"],
    )


@router.post("/build-day", response_model=BuildDayResponse, status_code=status.HTTP_201_CREATED)
def build_day(
    payload: BuildDayRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BuildDayResponse:
    request = payload or BuildDayRequest()
    try:
        result = TaskEngineService(db).build_day(
            current_user.id,
            schedule_date=request.date,
            commit=request.commit,
            max_items=request.max_items,
        )
    except (TaskEngineError, RelationshipError) as exc:
        raise _handle(exc)
    return BuildDayResponse(**result)


@router.post("/tasks/{task_id}/complete", response_model=CompleteTaskResponse)
def complete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompleteTaskResponse:
    try:
        result = TaskEngineService(db).complete_task(current_user.id, task_id)
    except (TaskEngineError, RelationshipError) as exc:
        raise _handle(exc)
    return CompleteTaskResponse(
        task=TaskOut(**result["task"]),
        daily_history_updated=result["daily_history_updated"],
        goal_progress=result["goal_progress"],
    )
