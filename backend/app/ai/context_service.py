"""
Unified Context Engine — V2.9

Single orchestration layer for all AI context assembly in HELIOS.
Every AI feature (daily briefing, assistant chat, planning, agent detail)
resolves its context through a ContextScope so the set of data sources is
explicit, auditable, and consistent across providers.

Scope → sections mapping lives in _SCOPE_SECTIONS. Adding a new data source
means adding one section builder and listing it in the relevant scopes —
no changes required to the routers or AI providers.

Security: every query is scoped with WHERE user_id = <id>.
          Cross-user data leakage is structurally impossible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.conversation import Conversation
from app.models.email import EmailMessage
from app.models.goal import Goal
from app.models.memory import AIMemory
from app.models.task import Task


# ── Scope ─────────────────────────────────────────────────────────────────────

class ContextScope(str, Enum):
    DAILY_BRIEFING = "daily_briefing"
    ASSISTANT_CHAT = "assistant_chat"
    AGENT_DETAIL   = "agent_detail"
    PLANNING       = "planning"


# ── Result ────────────────────────────────────────────────────────────────────

@dataclass
class ContextResult:
    text: str
    # Labels of data sources that contributed non-empty data, in assembly order.
    sources: list[str] = field(default_factory=list)


# ── Scope configuration ───────────────────────────────────────────────────────
# Sections are assembled in the order listed; only sections with data are
# included in the output text and the sources list.

_SCOPE_SECTIONS: dict[ContextScope, list[str]] = {
    ContextScope.DAILY_BRIEFING: [
        "user_profile",
        "goals",
        "tasks",
        "memories",
        "analytics",
        "calendar",
        "email",
        "conversations",
    ],
    ContextScope.ASSISTANT_CHAT: [
        "user_profile",
        "goals",
        "tasks",
        "memories",
        "analytics",
        "calendar",
    ],
    ContextScope.AGENT_DETAIL: [
        "goals",
        "tasks",
        "memories",
        "analytics",
    ],
    ContextScope.PLANNING: [
        "user_profile",
        "goals",
        "tasks",
        "memories",
        "analytics",
        "calendar",
    ],
}

# Fetch caps — each section trims results at the source.
_GOAL_LIMIT        = 10
_TASK_FETCH_LIMIT  = 60
_IN_PROGRESS_CAP   = 10
_HIGH_PRIORITY_CAP = 5
_OVERDUE_CAP       = 5
_MEMORY_LIMIT      = 10
_CALENDAR_LIMIT    = 5
_EMAIL_FETCH_LIMIT = 20  # Python re-sorts to top 5 by importance
_EMAIL_SHOW_LIMIT  = 5
_CONV_LIMIT        = 3


# ── Entry point ───────────────────────────────────────────────────────────────

def build_context(
    scope: ContextScope,
    user_id: str,
    db: Session,
    *,
    user_name: str | None = None,
) -> ContextResult:
    """
    Assemble a ContextResult for the given scope and user.

    Only sections registered for this scope are queried. Each section is
    included in the output only if it produced non-empty data, keeping
    prompts lean and avoiding placeholder text in AI responses.
    """
    section_names = _SCOPE_SECTIONS.get(scope, [])
    parts: list[str] = []
    sources: list[str] = []

    for name in section_names:
        text, label = _call_section(name, user_id=user_id, db=db, user_name=user_name)
        if text:
            parts.append(text)
            sources.append(label)

    if not parts:
        return ContextResult(text="No data available.", sources=[])
    return ContextResult(text="\n\n".join(parts), sources=sources)


def _call_section(
    name: str,
    *,
    user_id: str,
    db: Session,
    user_name: str | None,
) -> tuple[str | None, str]:
    """Dispatch section name → builder. Returns (text | None, source_label)."""
    match name:
        case "user_profile":  return _section_user_profile(user_name)
        case "goals":         return _section_goals(user_id, db)
        case "tasks":         return _section_tasks(user_id, db)
        case "memories":      return _section_memories(user_id, db)
        case "analytics":     return _section_analytics(user_id, db)
        case "calendar":      return _section_calendar(user_id, db)
        case "email":         return _section_email(user_id, db)
        case "conversations": return _section_conversations(user_id, db)
        case _:               return None, name


# ── Section builders ──────────────────────────────────────────────────────────

def _section_user_profile(user_name: str | None) -> tuple[str | None, str]:
    if not user_name:
        return None, "user_profile"
    return f"OPERATOR: {user_name}", "user_profile"


def _section_goals(user_id: str, db: Session) -> tuple[str | None, str]:
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
    if not active_goals:
        return None, "goals"
    lines = [f"ACTIVE GOALS ({len(active_goals)}):"]
    for g in active_goals:
        suffix = f" (target: {g.target_date})" if g.target_date else ""
        lines.append(f"  - {g.title}{suffix}")
    return "\n".join(lines), "goals"


def _section_tasks(user_id: str, db: Session) -> tuple[str | None, str]:
    today = date.today().isoformat()
    open_tasks = (
        db.execute(
            select(Task)
            .where(Task.user_id == user_id, Task.status.in_(["todo", "in_progress"]))
            .order_by(Task.updated_at.desc())
            .limit(_TASK_FETCH_LIMIT)
        )
        .scalars()
        .all()
    )
    if not open_tasks:
        return None, "tasks"

    in_progress: list[Task] = []
    high_priority: list[Task] = []
    overdue: list[Task] = []

    for t in open_tasks:
        if t.status == "in_progress" and len(in_progress) < _IN_PROGRESS_CAP:
            in_progress.append(t)
        if (
            t.status == "todo"
            and t.priority in ("high", "critical")
            and len(high_priority) < _HIGH_PRIORITY_CAP
        ):
            high_priority.append(t)
        if t.due_date and _date_lt(t.due_date, today) and len(overdue) < _OVERDUE_CAP:
            overdue.append(t)

    parts: list[str] = []
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

    if not parts:
        # Tasks exist but none are in-progress, high-priority, or overdue.
        parts.append(f"OPEN TASKS: {len(open_tasks)} total (no critical or in-progress items)")

    return "\n\n".join(parts), "tasks"


def _section_memories(user_id: str, db: Session) -> tuple[str | None, str]:
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
        return None, "memories"
    lines = [f"LONG-TERM MEMORY ({len(memories)} entries):"]
    for m in memories:
        lines.append(f"  [{m.memory_type.upper()}] {m.content}")
    return "\n".join(lines), "memories"


def _section_analytics(user_id: str, db: Session) -> tuple[str | None, str]:
    goal_rows = db.execute(select(Goal.status).where(Goal.user_id == user_id)).all()
    task_rows = db.execute(
        select(Task.status, Task.due_date).where(Task.user_id == user_id)
    ).all()

    if not goal_rows and not task_rows:
        return None, "analytics"

    today = date.today().isoformat()
    total_goals     = len(goal_rows)
    active_goals    = sum(1 for g in goal_rows if g.status == "active")
    completed_goals = sum(1 for g in goal_rows if g.status == "completed")
    total_tasks     = len(task_rows)
    done_tasks      = sum(1 for t in task_rows if t.status == "done")
    open_tasks      = sum(1 for t in task_rows if t.status in ("todo", "in_progress"))
    overdue_tasks   = sum(
        1 for t in task_rows
        if t.due_date and t.status != "done" and _date_lt(t.due_date, today)
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
    return "\n".join(lines), "analytics"


def _section_calendar(user_id: str, db: Session) -> tuple[str | None, str]:
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    rows = (
        db.execute(
            select(CalendarEvent.title, CalendarEvent.start_time, CalendarEvent.location)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.start_time >= now_iso,
            )
            .order_by(CalendarEvent.start_time)
            .limit(_CALENDAR_LIMIT)
        )
        .all()
    )
    if not rows:
        return None, "calendar"
    lines = [f"UPCOMING CALENDAR EVENTS ({len(rows)}):"]
    for r in rows:
        loc = f" @ {r.location}" if r.location else ""
        lines.append(f"  - {r.title} [{r.start_time[:16].replace('T', ' ')}]{loc}")
    return "\n".join(lines), "calendar"


def _section_email(user_id: str, db: Session) -> tuple[str | None, str]:
    _IMPORTANCE_ORDER: dict[str, int] = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    rows = (
        db.execute(
            select(
                EmailMessage.sender,
                EmailMessage.subject,
                EmailMessage.importance,
                EmailMessage.received_at,
            )
            .where(EmailMessage.user_id == user_id, EmailMessage.status == "unread")
            .order_by(EmailMessage.received_at.desc())
            .limit(_EMAIL_FETCH_LIMIT)
        )
        .all()
    )
    if not rows:
        return None, "email"
    top = sorted(rows, key=lambda r: (_IMPORTANCE_ORDER.get(r.importance, 2), r.received_at))[
        :_EMAIL_SHOW_LIMIT
    ]
    lines = [f"UNREAD MESSAGES ({len(top)} shown):"]
    for r in top:
        lines.append(f"  - [{r.importance.upper()}] {r.subject} (from: {r.sender})")
    return "\n".join(lines), "email"


def _section_conversations(user_id: str, db: Session) -> tuple[str | None, str]:
    rows = (
        db.execute(
            select(Conversation.title)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
            .limit(_CONV_LIMIT)
        )
        .all()
    )
    titled = [r.title for r in rows if r.title and r.title != "New Conversation"]
    if not titled:
        return None, "conversations"
    lines = [f"RECENT AI CONVERSATIONS ({len(titled)}):"]
    for t in titled:
        lines.append(f"  - {t}")
    return "\n".join(lines), "conversations"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _date_lt(date_str: str, compare: str) -> bool:
    """True if date_str is before compare. Lexicographic comparison is correct for ISO 8601."""
    try:
        return date_str.strip()[:10] < compare
    except Exception:
        return False
