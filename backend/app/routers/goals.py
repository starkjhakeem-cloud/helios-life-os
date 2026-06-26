import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.user import User
from app.schemas.goals import GoalCreate, GoalOut, GoalsResponse, GoalUpdate
from app.services.semantic_memory_service import SemanticMemoryService

logger = logging.getLogger(__name__)
router = APIRouter()


def _index_goal_memory(db: Session, goal: Goal) -> None:
    try:
        SemanticMemoryService(db).index_goal(goal)
    except Exception:
        logger.warning("Semantic goal indexing failed.", exc_info=True)


def _delete_goal_memory(db: Session, user_id: str, goal_id: str) -> None:
    try:
        SemanticMemoryService(db).delete_memory(user_id, "goal", goal_id)
    except Exception:
        logger.warning("Semantic goal memory delete failed.", exc_info=True)


def _to_out(goal: Goal) -> GoalOut:
    return GoalOut(
        id=goal.id,
        user_id=goal.user_id,
        title=goal.title,
        description=goal.description,
        status=goal.status,
        target_date=goal.target_date,
        created_at=goal.created_at.isoformat(),
        updated_at=goal.updated_at.isoformat(),
    )


@router.get("", response_model=GoalsResponse)
def list_goals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoalsResponse:
    rows = db.execute(
        select(Goal).where(Goal.user_id == current_user.id).order_by(Goal.created_at)
    ).scalars().all()
    return GoalsResponse(goals=[_to_out(g) for g in rows])


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(
    payload: GoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoalOut:
    now = datetime.now(timezone.utc)
    goal = Goal(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        target_date=payload.target_date,
        created_at=now,
        updated_at=now,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    _index_goal_memory(db, goal)
    return _to_out(goal)


@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: str,
    payload: GoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoalOut:
    goal = db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    ).scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")

    if payload.title is not None:
        goal.title = payload.title
    if payload.description is not None:
        goal.description = payload.description
    if payload.status is not None:
        goal.status = payload.status
    if payload.target_date is not None:
        goal.target_date = payload.target_date
    goal.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(goal)
    _index_goal_memory(db, goal)
    return _to_out(goal)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    goal = db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.user_id == current_user.id)
    ).scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    _delete_goal_memory(db, current_user.id, goal.id)
    db.delete(goal)
    db.commit()
