import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.schemas.tasks import TaskCreate, TaskOut, TasksResponse, TaskUpdate

router = APIRouter()


def _to_out(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        user_id=task.user_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        linked_goal_id=task.linked_goal_id,
        created_at=task.created_at.isoformat(),
        updated_at=task.updated_at.isoformat(),
    )


@router.get("", response_model=TasksResponse)
def list_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TasksResponse:
    rows = (
        db.execute(
            select(Task)
            .where(Task.user_id == current_user.id)
            .order_by(Task.created_at)
        )
        .scalars()
        .all()
    )
    return TasksResponse(tasks=[_to_out(t) for t in rows])


@router.post("", response_model=TaskOut, status_code=201)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskOut:
    # Verify the linked goal belongs to the current user — prevents cross-user FK linkage.
    if payload.linked_goal_id:
        goal = db.execute(
            select(Goal).where(Goal.id == payload.linked_goal_id, Goal.user_id == current_user.id)
        ).scalar_one_or_none()
        if not goal:
            raise HTTPException(status_code=404, detail="Goal not found.")

    now = datetime.now(timezone.utc)
    task = Task(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        due_date=payload.due_date,
        linked_goal_id=payload.linked_goal_id,
        created_at=now,
        updated_at=now,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _to_out(task)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TaskOut:
    task = db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    ).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    if payload.title is not None:
        task.title = payload.title
    if payload.description is not None:
        task.description = payload.description
    if payload.status is not None:
        task.status = payload.status
    if payload.priority is not None:
        task.priority = payload.priority
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.linked_goal_id is not None:
        task.linked_goal_id = payload.linked_goal_id
    task.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(task)
    return _to_out(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    task = db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == current_user.id)
    ).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    db.delete(task)
    db.commit()
