from datetime import date

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.daily_history import DailyHistory
from app.models.user import User
from app.schemas.daily_history import (
    DailyHistoryGenerateRequest,
    DailyHistoryMonthResponse,
    DailyHistoryNotesUpdate,
    DailyHistoryOut,
    DailyHistoryRangeResponse,
)
from app.services.daily_history_service import DailyHistoryService

router = APIRouter()


def _to_out(history: DailyHistory) -> DailyHistoryOut:
    return DailyHistoryOut(
        id=history.id,
        user_id=history.user_id,
        date=history.history_date,
        timezone=history.timezone,
        day_type=history.day_type,
        status=history.status,
        summary=history.summary,
        daily_brief=history.daily_brief,
        completed_tasks=history.completed_tasks,
        planned_tasks=history.planned_tasks,
        overdue_tasks=history.overdue_tasks,
        goals_snapshot=history.goals_snapshot,
        calendar_events=history.calendar_events,
        focus_blocks=history.focus_blocks,
        assistant_activity=history.assistant_activity,
        integration_activity=history.integration_activity,
        notes=history.notes,
        metadata=history.metadata_json,
        created_at=history.created_at.isoformat(),
        updated_at=history.updated_at.isoformat(),
        locked_at=history.locked_at.isoformat() if history.locked_at else None,
    )


@router.get("/day/{target_date}", response_model=DailyHistoryOut)
def get_history_day(
    target_date: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyHistoryOut:
    history = DailyHistoryService(db, current_user.id).get_day(target_date)
    if history is None:
        raise HTTPException(status_code=404, detail="Daily history not found.")
    return _to_out(history)


@router.get("/range", response_model=DailyHistoryRangeResponse)
def get_history_range(
    start_date: date = Query(...),
    end_date: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyHistoryRangeResponse:
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date.")
    rows = DailyHistoryService(db, current_user.id).get_range(start_date, end_date)
    return DailyHistoryRangeResponse(days=[_to_out(row) for row in rows], total=len(rows))


@router.get("/month", response_model=DailyHistoryMonthResponse)
def get_history_month(
    year: int = Query(..., ge=1, le=9999),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyHistoryMonthResponse:
    days = DailyHistoryService(db, current_user.id).get_month(year, month)
    return DailyHistoryMonthResponse(year=year, month=month, days=days, total=len(days))


@router.post("/day/{target_date}/generate", response_model=DailyHistoryOut)
def generate_history_day(
    target_date: date,
    payload: DailyHistoryGenerateRequest | None = Body(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyHistoryOut:
    history = DailyHistoryService(db, current_user.id).generate_day_history(target_date, payload)
    return _to_out(history)


@router.post("/day/{target_date}/lock", response_model=DailyHistoryOut)
def lock_history_day(
    target_date: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyHistoryOut:
    try:
        history = DailyHistoryService(db, current_user.id).lock_day(target_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _to_out(history)


@router.put("/day/{target_date}/notes", response_model=DailyHistoryOut)
def update_history_notes(
    target_date: date,
    payload: DailyHistoryNotesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyHistoryOut:
    history = DailyHistoryService(db, current_user.id).update_notes(target_date, payload)
    return _to_out(history)
