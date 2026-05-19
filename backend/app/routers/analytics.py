from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.schemas.analytics import AnalyticsSummary

router = APIRouter()


def _rate(part: int, total: int) -> float:
    return round((part / total) * 100, 1) if total > 0 else 0.0


@router.get("/summary", response_model=AnalyticsSummary)
def get_analytics_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalyticsSummary:
    goals = db.execute(
        select(Goal).where(Goal.user_id == current_user.id)
    ).scalars().all()

    tasks = db.execute(
        select(Task).where(Task.user_id == current_user.id)
    ).scalars().all()

    today = date.today().isoformat()

    # ── Goals ──────────────────────────────────────────────────────────────
    total_goals     = len(goals)
    completed_goals = sum(1 for g in goals if g.status == "completed")
    active_goals    = sum(1 for g in goals if g.status == "active")
    paused_goals    = sum(1 for g in goals if g.status == "paused")

    # ── Tasks ──────────────────────────────────────────────────────────────
    total_tasks       = len(tasks)
    completed_tasks   = sum(1 for t in tasks if t.status == "done")
    in_progress_tasks = sum(1 for t in tasks if t.status == "in_progress")
    todo_tasks        = sum(1 for t in tasks if t.status == "todo")
    overdue_tasks     = sum(
        1 for t in tasks
        if t.due_date and t.status != "done" and t.due_date < today
    )
    high_priority_tasks = sum(
        1 for t in tasks
        if t.priority in ("high", "critical") and t.status != "done"
    )

    return AnalyticsSummary(
        total_goals=total_goals,
        completed_goals=completed_goals,
        active_goals=active_goals,
        paused_goals=paused_goals,
        goal_completion_rate=_rate(completed_goals, total_goals),
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        in_progress_tasks=in_progress_tasks,
        todo_tasks=todo_tasks,
        overdue_tasks=overdue_tasks,
        high_priority_tasks=high_priority_tasks,
        task_completion_rate=_rate(completed_tasks, total_tasks),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
