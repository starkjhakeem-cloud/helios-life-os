"""
Build a plain-text context summary of a user's active goals and open tasks.

This summary is injected into AI prompts when the user enables context mode —
it lets the AI give grounded, specific advice rather than generic guidance.

Security: every query is scoped with WHERE user_id = <current_user.id>.
          Cross-user data leakage is structurally impossible.

No schema changes: all data comes from the existing goals and tasks tables.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.goal import Goal
from app.models.task import Task

_GOAL_LIMIT = 10
_TASK_FETCH_LIMIT = 60   # generous fetch; we filter + cap in Python
_IN_PROGRESS_CAP = 10
_HIGH_PRIORITY_CAP = 5
_OVERDUE_CAP = 5


def build_user_context(user_id: str, db: Session) -> str:
    """
    Return a concise, human-readable summary of the user's current
    goals and tasks suitable for inclusion in an AI system prompt.
    Never includes data belonging to another user.
    """
    today = date.today().isoformat()

    # ── Goals ────────────────────────────────────────────────────────────────
    active_goals = (
        db.execute(
            select(Goal)
            .where(Goal.user_id == user_id, Goal.status == "active")
            .order_by(Goal.created_at.desc())
            .limit(_GOAL_LIMIT)
        )
        .scalars()
        .all()
    )

    # ── Tasks (single query; categorised in Python) ──────────────────────────
    open_tasks = (
        db.execute(
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.status.in_(["todo", "in_progress"]),
            )
            .order_by(Task.updated_at.desc())
            .limit(_TASK_FETCH_LIMIT)
        )
        .scalars()
        .all()
    )

    in_progress: list[Task] = []
    high_priority: list[Task] = []
    overdue: list[Task] = []

    for task in open_tasks:
        if task.status == "in_progress" and len(in_progress) < _IN_PROGRESS_CAP:
            in_progress.append(task)
        if (
            task.status == "todo"
            and task.priority in ("high", "critical")
            and len(high_priority) < _HIGH_PRIORITY_CAP
        ):
            high_priority.append(task)
        if (
            task.due_date
            and _safe_date_lt(task.due_date, today)
            and len(overdue) < _OVERDUE_CAP
        ):
            overdue.append(task)

    # ── Render ───────────────────────────────────────────────────────────────
    parts: list[str] = []

    if active_goals:
        lines = [f"ACTIVE GOALS ({len(active_goals)}):"]
        for g in active_goals:
            suffix = f" (target: {g.target_date})" if g.target_date else ""
            lines.append(f"  - {g.title}{suffix}")
        parts.append("\n".join(lines))
    else:
        parts.append("ACTIVE GOALS: none")

    if in_progress:
        lines = [f"IN-PROGRESS TASKS ({len(in_progress)}):"]
        for t in in_progress:
            lines.append(f"  - {t.title} [{t.priority.upper()}]")
        parts.append("\n".join(lines))

    if high_priority:
        lines = [f"HIGH-PRIORITY OPEN TASKS ({len(high_priority)}):"]
        for t in high_priority:
            due = f" (due: {t.due_date})" if t.due_date else ""
            lines.append(f"  - {t.title}{due}")
        parts.append("\n".join(lines))

    if overdue:
        lines = [f"OVERDUE TASKS ({len(overdue)}):"]
        for t in overdue:
            lines.append(f"  - {t.title} (was due: {t.due_date})")
        parts.append("\n".join(lines))

    return "\n\n".join(parts) if parts else "No active goals or open tasks found."


def _safe_date_lt(date_str: str, compare: str) -> bool:
    """True if date_str is before compare. Returns False on any parse error."""
    try:
        return date_str.strip()[:10] < compare
    except Exception:
        return False
