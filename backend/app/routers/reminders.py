import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.reminder import Reminder
from app.models.task import Task
from app.models.user import User
from app.schemas.reminders import ReminderCreate, ReminderOut, RemindersResponse, ReminderUpdate

router = APIRouter()


def _to_out(r: Reminder) -> ReminderOut:
    return ReminderOut(
        id=r.id,
        user_id=r.user_id,
        title=r.title,
        body=r.body,
        remind_at=r.remind_at,
        is_enabled=r.is_enabled,
        task_id=r.task_id,
        goal_id=r.goal_id,
        created_at=r.created_at.isoformat(),
        updated_at=r.updated_at.isoformat(),
    )


@router.get("", response_model=RemindersResponse)
def list_reminders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RemindersResponse:
    """Return all reminders for the current user, most recent first."""
    rows = db.execute(
        select(Reminder)
        .where(Reminder.user_id == current_user.id)
        .order_by(Reminder.remind_at.asc())
    ).scalars().all()
    return RemindersResponse(reminders=[_to_out(r) for r in rows])


@router.post("", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
def create_reminder(
    payload: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReminderOut:
    """Create a new reminder associated with the current user."""
    # Verify optional FKs belong to the current user — prevents cross-user linkage.
    if payload.task_id:
        task = db.execute(
            select(Task).where(Task.id == payload.task_id, Task.user_id == current_user.id)
        ).scalar_one_or_none()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found.")
    if payload.goal_id:
        goal = db.execute(
            select(Goal).where(Goal.id == payload.goal_id, Goal.user_id == current_user.id)
        ).scalar_one_or_none()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found.")

    now = datetime.now(timezone.utc)
    reminder = Reminder(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=payload.title,
        body=payload.body,
        remind_at=payload.remind_at,
        is_enabled=payload.is_enabled,
        task_id=payload.task_id,
        goal_id=payload.goal_id,
        created_at=now,
        updated_at=now,
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return _to_out(reminder)


@router.patch("/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    reminder_id: str,
    payload: ReminderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReminderOut:
    """Update a reminder. Only fields present in the payload are changed."""
    reminder = db.execute(
        select(Reminder).where(
            Reminder.id == reminder_id,
            Reminder.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found.")

    if payload.title is not None:
        reminder.title = payload.title
    if payload.body is not None:
        reminder.body = payload.body
    if payload.remind_at is not None:
        reminder.remind_at = payload.remind_at
    if payload.is_enabled is not None:
        reminder.is_enabled = payload.is_enabled
    reminder.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(reminder)
    return _to_out(reminder)


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    reminder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a reminder. 404 if not owned by current user."""
    reminder = db.execute(
        select(Reminder).where(
            Reminder.id == reminder_id,
            Reminder.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found.")
    db.delete(reminder)
    db.commit()
