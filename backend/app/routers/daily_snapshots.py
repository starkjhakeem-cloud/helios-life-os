from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.daily_snapshot import DailyMemorySnapshot
from app.models.user import User
from app.schemas.daily_snapshot import (
    DailySnapshotGenerate,
    DailySnapshotOut,
    DailySnapshotRangeResponse,
    DailySnapshotUpsert,
)
from app.services.daily_snapshot_service import (
    generate_snapshot,
    get_snapshot,
    list_snapshots,
    upsert_snapshot,
)

router = APIRouter()


def _to_out(snapshot: DailyMemorySnapshot) -> DailySnapshotOut:
    return DailySnapshotOut(
        id=snapshot.id,
        user_id=snapshot.user_id,
        snapshot_date=snapshot.snapshot_date,
        generated_at=snapshot.generated_at.isoformat(),
        tasks_completed=snapshot.tasks_completed,
        tasks_planned=snapshot.tasks_planned,
        overdue_tasks=snapshot.overdue_tasks,
        active_goals=snapshot.active_goals,
        goal_progress=snapshot.goal_progress,
        calendar_events=snapshot.calendar_events,
        focus_blocks=snapshot.focus_blocks,
        daily_brief=snapshot.daily_brief,
        assistant_activity=snapshot.assistant_activity,
        connected_service_sync=snapshot.connected_service_sync,
        notes=snapshot.notes,
        created_at=snapshot.created_at.isoformat(),
        updated_at=snapshot.updated_at.isoformat(),
    )


@router.get("/{snapshot_date}", response_model=DailySnapshotOut)
def get_daily_snapshot(
    snapshot_date: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailySnapshotOut:
    snapshot = get_snapshot(db, current_user.id, snapshot_date)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Daily snapshot not found.")
    return _to_out(snapshot)


@router.get("", response_model=DailySnapshotRangeResponse)
def get_daily_snapshots_range(
    start_date: date = Query(...),
    end_date: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailySnapshotRangeResponse:
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date.")
    rows = list_snapshots(db, current_user.id, start_date, end_date)
    return DailySnapshotRangeResponse(snapshots=[_to_out(row) for row in rows], total=len(rows))


@router.put("/{snapshot_date}", response_model=DailySnapshotOut)
def put_daily_snapshot(
    snapshot_date: date,
    payload: DailySnapshotUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailySnapshotOut:
    if payload.snapshot_date != snapshot_date:
        raise HTTPException(status_code=400, detail="Path date must match payload snapshot_date.")
    snapshot = upsert_snapshot(db, current_user.id, payload)
    return _to_out(snapshot)


@router.post("/generate", response_model=DailySnapshotOut)
def post_generate_daily_snapshot(
    payload: DailySnapshotGenerate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailySnapshotOut:
    snapshot = generate_snapshot(db, current_user.id, payload)
    return _to_out(snapshot)
