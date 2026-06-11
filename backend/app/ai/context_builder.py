"""
Build a plain-text context summary of a user's active goals, open tasks, and
long-term AI memories.

This summary is injected into AI prompts when the user enables context mode —
it lets the AI give grounded, specific advice rather than generic guidance.

Security: every query is scoped with WHERE user_id = <current_user.id>.
          Cross-user data leakage is structurally impossible.

No schema changes: all data comes from the existing goals, tasks, and
ai_memories tables.
"""

from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.conversation import Conversation
from app.models.goal import Goal
from app.models.memory import AIMemory
from app.models.task import Task

_GOAL_LIMIT = 10
_TASK_FETCH_LIMIT = 60   # generous fetch; we filter + cap in Python
_IN_PROGRESS_CAP = 10
_HIGH_PRIORITY_CAP = 5
_OVERDUE_CAP = 5
_MEMORY_LIMIT = 10       # most recent memories injected per request


def build_user_context(user_id: str, db: Session) -> str:
    """
    Return a concise, human-readable summary of the user's current goals,
    tasks, and long-term memories suitable for inclusion in an AI system
    prompt. Never includes data belonging to another user.
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

    memory_section = _build_memory_section(user_id, db)
    if memory_section:
        parts.append(memory_section)

    return "\n\n".join(parts) if parts else "No active goals or open tasks found."


def build_memory_context(user_id: str, db: Session) -> str | None:
    """
    Return only the long-term memory section. Used by the chat endpoint when
    the operator has opted out of live goals/tasks context but memories should
    still personalise the response.
    """
    return _build_memory_section(user_id, db)


def _build_memory_section(user_id: str, db: Session) -> str | None:
    memories = (
        db.execute(
            select(AIMemory)
            .where(AIMemory.user_id == user_id)
            .order_by(AIMemory.created_at.desc())
            .limit(_MEMORY_LIMIT)
        )
        .scalars()
        .all()
    )
    if not memories:
        return None
    lines = [f"LONG-TERM MEMORY ({len(memories)} entries):"]
    for m in memories:
        lines.append(f"  [{m.memory_type.upper()}] {m.content}")
    return "\n".join(lines)


def build_briefing_context(user_id: str, db: Session) -> str:
    """
    Extended context for the daily briefing.

    Builds on build_user_context() and appends:
      - A compact analytics summary (goal/task completion rates, overdue count)
      - The 3 most recent titled conversation names

    This gives the briefing engine richer situational awareness than the chat
    context, which is intentionally leaner to keep response latency low.
    """
    base = build_user_context(user_id=user_id, db=db)
    extras: list[str] = []

    analytics = _build_analytics_section(user_id, db)
    if analytics:
        extras.append(analytics)

    conversations = _build_recent_conversations_section(user_id, db)
    if conversations:
        extras.append(conversations)

    upcoming = _build_upcoming_events_section(user_id, db)
    if upcoming:
        extras.append(upcoming)

    if extras:
        return base + "\n\n" + "\n\n".join(extras)
    return base


def _build_analytics_section(user_id: str, db: Session) -> str | None:
    goal_rows = db.execute(
        select(Goal.status).where(Goal.user_id == user_id)
    ).all()
    task_rows = db.execute(
        select(Task.status, Task.due_date).where(Task.user_id == user_id)
    ).all()

    if not goal_rows and not task_rows:
        return None

    today = date.today().isoformat()

    total_goals = len(goal_rows)
    active_goals = sum(1 for g in goal_rows if g.status == "active")
    completed_goals = sum(1 for g in goal_rows if g.status == "completed")

    total_tasks = len(task_rows)
    done_tasks = sum(1 for t in task_rows if t.status == "done")
    open_tasks = sum(1 for t in task_rows if t.status in ("todo", "in_progress"))
    overdue_tasks = sum(
        1 for t in task_rows
        if t.due_date and t.status != "done" and _safe_date_lt(t.due_date, today)
    )

    lines = ["ANALYTICS SUMMARY:"]
    if total_goals > 0:
        goal_rate = round((completed_goals / total_goals) * 100)
        lines.append(
            f"  Goals: {active_goals} active, {completed_goals} completed "
            f"({goal_rate}% completion rate, {total_goals} total)"
        )
    if total_tasks > 0:
        task_rate = round((done_tasks / total_tasks) * 100)
        lines.append(
            f"  Tasks: {open_tasks} open, {done_tasks} done "
            f"({task_rate}% completion rate, {total_tasks} total)"
        )
    if overdue_tasks > 0:
        lines.append(f"  Overdue tasks: {overdue_tasks} (require immediate attention)")
    return "\n".join(lines)


def _build_recent_conversations_section(user_id: str, db: Session) -> str | None:
    rows = (
        db.execute(
            select(Conversation.title)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
            .limit(3)
        )
        .all()
    )
    titled = [r.title for r in rows if r.title and r.title != "New Conversation"]
    if not titled:
        return None
    lines = [f"RECENT AI CONVERSATIONS ({len(titled)}):"]
    for t in titled:
        lines.append(f"  - {t}")
    return "\n".join(lines)


def _build_upcoming_events_section(user_id: str, db: Session) -> str | None:
    """
    Return the next 5 calendar events starting from now, formatted for the
    daily briefing context. Uses ISO 8601 string comparison (lexicographic),
    which is correct for zero-padded UTC timestamps.
    """
    from datetime import timezone
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    rows = (
        db.execute(
            select(CalendarEvent.title, CalendarEvent.start_time, CalendarEvent.location)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.start_time >= now_iso,
            )
            .order_by(CalendarEvent.start_time)
            .limit(5)
        )
        .all()
    )
    if not rows:
        return None
    lines = [f"UPCOMING CALENDAR EVENTS ({len(rows)}):"]
    for r in rows:
        loc = f" @ {r.location}" if r.location else ""
        lines.append(f"  - {r.title} [{r.start_time[:16].replace('T', ' ')}]{loc}")
    return "\n".join(lines)


def _safe_date_lt(date_str: str, compare: str) -> bool:
    """True if date_str is before compare. Returns False on any parse error."""
    try:
        return date_str.strip()[:10] < compare
    except Exception:
        return False
