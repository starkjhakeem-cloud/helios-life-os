"""
Agent Context Engine — V2.3

Gathers a user's data from all available sources (memories, goals, tasks,
analytics, recent conversations) and packages it into a structured, per-agent
context snapshot.

Security:
  Every query is scoped with WHERE user_id = <current_user.id>.
  Output items are human-readable preview strings only — no primary keys,
  no JWT tokens, no secrets, no raw model fields are surfaced.

Design:
  - is_active: whether THIS agent is configured to read a given source.
    Goals, tasks, analytics, and conversations are active for all agents.
    Memory access follows the agent's memory_context_enabled flag.
  - item_count: how many records exist in the user's data for the category.
    Zero means the user has no data yet; the section is still returned so
    the frontend can display a "no data" state rather than hiding it.
  - items: up to 5 short preview strings, safe to display in the UI.
"""

from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, ConversationMessage
from app.models.goal import Goal
from app.models.memory import AIMemory
from app.models.task import Task
from app.schemas.agents import AgentContextPackage, AgentContextSection

# Per-section item preview caps
_MEMORY_PREVIEW   = 5
_GOAL_PREVIEW     = 5
_TASK_PREVIEW     = 5
_CONV_PREVIEW     = 3
_PREVIEW_MAX_CHARS = 90  # truncate individual preview strings to this length


def build_agent_context(
    *,
    agent_id: str,
    agent_name: str,
    memory_context_enabled: bool,
    user_id: str,
    db: Session,
) -> AgentContextPackage:
    """
    Build and return a full context package for the given agent and user.
    Never raises — empty data is represented by item_count=0 and items=[].
    """
    sections = [
        _memory_section(user_id=user_id, db=db, is_active=memory_context_enabled),
        _goals_section(user_id=user_id, db=db),
        _tasks_section(user_id=user_id, db=db),
        _analytics_section(user_id=user_id, db=db),
        _conversations_section(user_id=user_id, db=db),
    ]

    return AgentContextPackage(
        agent_id=agent_id,
        agent_name=agent_name,
        sections=sections,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


# ── Section builders ──────────────────────────────────────────────────────────

def _memory_section(user_id: str, db: Session, *, is_active: bool) -> AgentContextSection:
    total: int = db.execute(
        select(func.count()).select_from(AIMemory).where(AIMemory.user_id == user_id)
    ).scalar_one()

    items: list[str] = []
    if is_active and total > 0:
        rows = (
            db.execute(
                select(AIMemory.memory_type, AIMemory.content)
                .where(AIMemory.user_id == user_id)
                .order_by(AIMemory.created_at.desc())
                .limit(_MEMORY_PREVIEW)
            )
            .all()
        )
        items = [
            _truncate(f"[{r.memory_type.upper().replace('_', ' ')}] {r.content}")
            for r in rows
        ]

    return AgentContextSection(
        category="memory",
        label="AI Memory",
        description="Long-term user preferences, facts, goals context, and recurring interests.",
        is_active=is_active,
        item_count=total,
        items=items,
    )


def _goals_section(user_id: str, db: Session) -> AgentContextSection:
    active_count: int = db.execute(
        select(func.count())
        .select_from(Goal)
        .where(Goal.user_id == user_id, Goal.status == "active")
    ).scalar_one()

    items: list[str] = []
    if active_count > 0:
        rows = (
            db.execute(
                select(Goal.title, Goal.target_date)
                .where(Goal.user_id == user_id, Goal.status == "active")
                .order_by(Goal.created_at.desc())
                .limit(_GOAL_PREVIEW)
            )
            .all()
        )
        items = [
            _truncate(f"{r.title}" + (f"  ·  target {r.target_date}" if r.target_date else ""))
            for r in rows
        ]

    return AgentContextSection(
        category="goals",
        label="Goals",
        description="Active objectives the operator is working towards.",
        is_active=True,
        item_count=active_count,
        items=items,
    )


def _tasks_section(user_id: str, db: Session) -> AgentContextSection:
    open_count: int = db.execute(
        select(func.count())
        .select_from(Task)
        .where(Task.user_id == user_id, Task.status.in_(["todo", "in_progress"]))
    ).scalar_one()

    items: list[str] = []
    if open_count > 0:
        today = date.today().isoformat()
        rows = (
            db.execute(
                select(Task.title, Task.status, Task.priority, Task.due_date)
                .where(Task.user_id == user_id, Task.status.in_(["todo", "in_progress"]))
                .order_by(Task.updated_at.desc())
                .limit(20)
            )
            .all()
        )
        # Surface in_progress first, then high-priority, then cap to preview limit
        prioritised: list[str] = []
        rest: list[str] = []
        for r in rows:
            overdue = r.due_date and r.due_date < today
            suffix = " ·  OVERDUE" if overdue else ""
            label = f"{r.title}  [{r.priority.upper()}]{suffix}"
            if r.status == "in_progress" or r.priority in ("high", "critical"):
                prioritised.append(label)
            else:
                rest.append(label)
        combined = prioritised + rest
        items = [_truncate(s) for s in combined[:_TASK_PREVIEW]]

    return AgentContextSection(
        category="tasks",
        label="Tasks",
        description="Open tasks — in-progress and high-priority items shown first.",
        is_active=True,
        item_count=open_count,
        items=items,
    )


def _analytics_section(user_id: str, db: Session) -> AgentContextSection:
    goals = db.execute(
        select(Goal.status).where(Goal.user_id == user_id)
    ).all()

    tasks = db.execute(
        select(Task.status, Task.priority, Task.due_date).where(Task.user_id == user_id)
    ).all()

    total_goals     = len(goals)
    active_goals    = sum(1 for g in goals if g.status == "active")
    completed_goals = sum(1 for g in goals if g.status == "completed")

    today = date.today().isoformat()
    total_tasks     = len(tasks)
    done_tasks      = sum(1 for t in tasks if t.status == "done")
    open_tasks      = sum(1 for t in tasks if t.status in ("todo", "in_progress"))
    overdue_tasks   = sum(
        1 for t in tasks
        if t.due_date and t.status != "done" and t.due_date < today
    )
    high_priority   = sum(
        1 for t in tasks
        if t.priority in ("high", "critical") and t.status != "done"
    )

    goal_rate = round((completed_goals / total_goals) * 100) if total_goals > 0 else 0
    task_rate = round((done_tasks / total_tasks) * 100) if total_tasks > 0 else 0

    has_data = total_goals > 0 or total_tasks > 0

    items: list[str] = []
    if has_data:
        items = [
            f"{active_goals} active goal{'s' if active_goals != 1 else ''}"
            + (f"  ·  {goal_rate}% completed" if total_goals > 0 else ""),
            f"{open_tasks} open task{'s' if open_tasks != 1 else ''}"
            + (f"  ·  {task_rate}% completion rate" if total_tasks > 0 else ""),
        ]
        if overdue_tasks > 0:
            items.append(f"{overdue_tasks} overdue task{'s' if overdue_tasks != 1 else ''}")
        if high_priority > 0:
            items.append(f"{high_priority} high-priority task{'s' if high_priority != 1 else ''} open")

    return AgentContextSection(
        category="analytics",
        label="Analytics",
        description="Aggregated goal and task metrics for situational awareness.",
        is_active=True,
        item_count=1 if has_data else 0,
        items=items,
    )


def _conversations_section(user_id: str, db: Session) -> AgentContextSection:
    total: int = db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.user_id == user_id)
    ).scalar_one()

    items: list[str] = []
    if total > 0:
        rows = (
            db.execute(
                select(Conversation.title)
                .where(Conversation.user_id == user_id)
                .order_by(Conversation.updated_at.desc())
                .limit(_CONV_PREVIEW)
            )
            .all()
        )
        items = [_truncate(r.title) for r in rows if r.title != "New Conversation"]
        # Fall back to generic label if all conversations are untitled
        if not items and total > 0:
            items = [f"{total} conversation{'s' if total != 1 else ''} on record"]

    return AgentContextSection(
        category="conversations",
        label="Conversations",
        description="Prior AI chat history providing continuity across sessions.",
        is_active=True,
        item_count=total,
        items=items,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _truncate(s: str) -> str:
    s = s.strip()
    return s if len(s) <= _PREVIEW_MAX_CHARS else s[:_PREVIEW_MAX_CHARS - 1] + "…"
