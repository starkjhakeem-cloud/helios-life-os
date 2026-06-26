from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.daily_snapshot import DailyMemorySnapshot
from app.models.focus_block import FocusBlock
from app.models.goal import Goal
from app.models.task import Task
from app.schemas.daily_snapshot import DailySnapshotGenerate, DailySnapshotUpsert


COMPLETED_TASK_STATUSES = {"done", "completed"}
INACTIVE_TASK_STATUSES = {"archived", "cancelled", "deleted"}
ACTIVE_GOAL_STATUSES = {"active", "in_progress", "in-progress", "Active", "In Progress"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _day_bounds(snapshot_date: date) -> tuple[str, str]:
    start = datetime.combine(snapshot_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(snapshot_date, time.max, tzinfo=timezone.utc)
    return start.isoformat().replace("+00:00", "Z"), end.isoformat().replace("+00:00", "Z")


def _date_prefix(snapshot_date: date) -> str:
    return snapshot_date.isoformat()


def _task_to_dict(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "linked_goal_id": task.linked_goal_id,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


def _goal_to_dict(goal: Goal) -> dict[str, Any]:
    return {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "status": goal.status,
        "target_date": goal.target_date,
        "created_at": goal.created_at.isoformat(),
        "updated_at": goal.updated_at.isoformat(),
    }


def _event_to_dict(event: CalendarEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "description": event.description,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "location": event.location,
        "source": event.source,
        "external_event_id": event.external_event_id,
        "created_at": event.created_at.isoformat(),
        "updated_at": event.updated_at.isoformat(),
    }


def _focus_block_to_dict(block: FocusBlock) -> dict[str, Any]:
    return {
        "id": block.id,
        "title": block.title,
        "start_time": block.start_time,
        "end_time": block.end_time,
        "linked_goal_id": block.linked_goal_id,
        "linked_task_ids": block.linked_task_ids or [],
        "status": block.status,
        "source": block.source,
        "notes": block.notes,
        "actual_start": block.actual_start,
        "actual_end": block.actual_end,
        "created_at": block.created_at.isoformat(),
        "updated_at": block.updated_at.isoformat(),
    }


def _goal_progress(goal: Goal, tasks: list[Task]) -> dict[str, Any]:
    linked = [task for task in tasks if task.linked_goal_id == goal.id]
    completed = [task for task in linked if task.status.lower() in COMPLETED_TASK_STATUSES]
    progress = 0 if not linked else round((len(completed) / len(linked)) * 100)
    return {
        "goal_id": goal.id,
        "title": goal.title,
        "status": goal.status,
        "linked_tasks": len(linked),
        "completed_tasks": len(completed),
        "progress": progress,
    }


def get_snapshot(db: Session, user_id: str, snapshot_date: date) -> DailyMemorySnapshot | None:
    return db.execute(
        select(DailyMemorySnapshot).where(
            DailyMemorySnapshot.user_id == user_id,
            DailyMemorySnapshot.snapshot_date == snapshot_date,
        )
    ).scalar_one_or_none()


def list_snapshots(
    db: Session,
    user_id: str,
    start_date: date,
    end_date: date,
) -> list[DailyMemorySnapshot]:
    return (
        db.execute(
            select(DailyMemorySnapshot)
            .where(
                DailyMemorySnapshot.user_id == user_id,
                DailyMemorySnapshot.snapshot_date >= start_date,
                DailyMemorySnapshot.snapshot_date <= end_date,
            )
            .order_by(DailyMemorySnapshot.snapshot_date)
        )
        .scalars()
        .all()
    )


def build_snapshot_payload(
    db: Session,
    user_id: str,
    snapshot_date: date,
    extras: DailySnapshotGenerate | None = None,
) -> dict[str, Any]:
    date_prefix = _date_prefix(snapshot_date)
    day_start, day_end = _day_bounds(snapshot_date)

    tasks = (
        db.execute(select(Task).where(Task.user_id == user_id).order_by(Task.created_at))
        .scalars()
        .all()
    )
    goals = (
        db.execute(select(Goal).where(Goal.user_id == user_id).order_by(Goal.created_at))
        .scalars()
        .all()
    )
    events = (
        db.execute(
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.start_time >= day_start,
                CalendarEvent.start_time <= day_end,
            )
            .order_by(CalendarEvent.start_time)
        )
        .scalars()
        .all()
    )
    focus_blocks = (
        db.execute(
            select(FocusBlock)
            .where(
                FocusBlock.user_id == user_id,
                FocusBlock.start_time >= day_start,
                FocusBlock.start_time <= day_end,
            )
            .order_by(FocusBlock.start_time)
        )
        .scalars()
        .all()
    )

    completed = [
        task for task in tasks
        if task.status.lower() in COMPLETED_TASK_STATUSES
        and (
            task.updated_at.date() == snapshot_date
            or bool(task.due_date and task.due_date[:10] == date_prefix)
        )
    ]
    planned = [
        task for task in tasks
        if task.status.lower() not in COMPLETED_TASK_STATUSES | INACTIVE_TASK_STATUSES
        and task.due_date
        and task.due_date[:10] == date_prefix
    ]
    overdue = [
        task for task in tasks
        if task.status.lower() not in COMPLETED_TASK_STATUSES | INACTIVE_TASK_STATUSES
        and task.due_date
        and task.due_date[:10] < date_prefix
    ]
    active_goals = [goal for goal in goals if goal.status in ACTIVE_GOAL_STATUSES or goal.status.lower() in {"active", "in_progress", "in-progress"}]

    return {
        "tasks_completed": [_task_to_dict(task) for task in completed],
        "tasks_planned": [_task_to_dict(task) for task in planned],
        "overdue_tasks": [_task_to_dict(task) for task in overdue],
        "active_goals": [_goal_to_dict(goal) for goal in active_goals],
        "goal_progress": [_goal_progress(goal, tasks) for goal in active_goals],
        "calendar_events": [_event_to_dict(event) for event in events],
        "focus_blocks": [_focus_block_to_dict(block) for block in focus_blocks],
        "daily_brief": extras.daily_brief if extras else None,
        "assistant_activity": extras.assistant_activity if extras and extras.assistant_activity is not None else [],
        "connected_service_sync": extras.connected_service_sync if extras else None,
        "notes": extras.notes if extras else None,
    }


def upsert_snapshot(
    db: Session,
    user_id: str,
    payload: DailySnapshotUpsert,
) -> DailyMemorySnapshot:
    snapshot = get_snapshot(db, user_id, payload.snapshot_date)
    now = _utc_now()

    values = payload.model_dump(exclude={"snapshot_date"}, exclude_unset=True)
    if snapshot is None:
        snapshot = DailyMemorySnapshot(
            id=str(uuid.uuid4()),
            user_id=user_id,
            snapshot_date=payload.snapshot_date,
            generated_at=now,
            created_at=now,
            updated_at=now,
            tasks_completed=[],
            tasks_planned=[],
            overdue_tasks=[],
            active_goals=[],
            goal_progress=[],
            calendar_events=[],
            focus_blocks=[],
            assistant_activity=[],
        )
        db.add(snapshot)

    for key, value in values.items():
        setattr(snapshot, key, value)

    snapshot.generated_at = now
    snapshot.updated_at = now
    db.commit()
    db.refresh(snapshot)
    return snapshot


def generate_snapshot(
    db: Session,
    user_id: str,
    payload: DailySnapshotGenerate,
) -> DailyMemorySnapshot:
    existing = get_snapshot(db, user_id, payload.snapshot_date)
    if existing is not None and not payload.regenerate:
        return existing

    generated = build_snapshot_payload(db, user_id, payload.snapshot_date, payload)
    return upsert_snapshot(
        db,
        user_id,
        DailySnapshotUpsert(snapshot_date=payload.snapshot_date, **generated),
    )
