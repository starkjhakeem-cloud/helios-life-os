"""
Task/Goal/Calendar Relationship Service — HELIOS

Provides the business logic that connects tasks, goals, focus blocks, and
calendar events into one coherent system.

All methods are deterministic (no AI calls). Security: every operation
validates that the acting user owns every resource being modified or linked.

Usage:
    svc = TaskGoalCalendarService(db)
    result = svc.link_task_to_goal(user_id, task_id, goal_id)
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.focus_block import FocusBlock
from app.models.goal import Goal
from app.models.task import Task


# ── Error codes ────────────────────────────────────────────────────────────────

class RelationshipError(Exception):
    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


_TASK_NOT_FOUND               = "task_not_found"
_GOAL_NOT_FOUND               = "goal_not_found"
_FOCUS_BLOCK_NOT_FOUND        = "focus_block_not_found"
_CALENDAR_CONFLICT            = "calendar_conflict"
_INVALID_TIME_RANGE           = "invalid_time_range"
_PERMISSION_DENIED            = "permission_denied"
_RELATIONSHIP_EXISTS          = "relationship_already_exists"
_NO_LINKED_GOAL               = "no_linked_goal"
_INVALID_STATUS_TRANSITION    = "invalid_status_transition"

# Allowed status transitions. Terminal states map to empty sets.
_VALID_TRANSITIONS: dict[str, frozenset[str]] = {
    "planned":     frozenset({"in_progress", "cancelled"}),
    "in_progress": frozenset({"planned", "completed", "cancelled"}),
    "completed":   frozenset(),
    "cancelled":   frozenset(),
}

# Business hours for available-window detection (UTC hour, 0-23)
_BUSINESS_START_HOUR = 8
_BUSINESS_END_HOUR   = 22
_MIN_WINDOW_MINUTES  = 15

# Priority weights used in NBA scoring
_TASK_PRIORITY_SCORE  = {"critical": 40, "high": 30, "medium": 15, "low": 5}
_GOAL_PRIORITY_SCORE  = {"critical": 20, "high": 15, "medium": 5,  "low": 2}
_NBA_MAX_SCORE             = 175  # includes +25 focus-block-in-progress boost
_FOCUS_BLOCK_ACTIVE_BOOST  = 25   # score added when task is in an in_progress block


# ── Internal helpers ───────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(s: str) -> datetime:
    """Parse ISO 8601 string (Z or +00:00 suffix) to UTC-aware datetime."""
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def _fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _duration_minutes(start: str, end: str) -> int:
    return int((_parse_dt(end) - _parse_dt(start)).total_seconds() / 60)


def _events_overlap(s1: str, e1: str, s2: str, e2: str) -> bool:
    return _parse_dt(s1) < _parse_dt(e2) and _parse_dt(e1) > _parse_dt(s2)


def _task_out(t: Task) -> dict[str, Any]:
    return {
        "id":                        t.id,
        "user_id":                   t.user_id,
        "title":                     t.title,
        "description":               t.description,
        "status":                    t.status,
        "priority":                  t.priority,
        "due_date":                  t.due_date,
        "linked_goal_id":            t.linked_goal_id,
        "estimated_duration_minutes": t.estimated_duration_minutes,
        "category":                  t.category,
        "scheduled_start":           t.scheduled_start,
        "scheduled_end":             t.scheduled_end,
        "focus_block_id":            t.focus_block_id,
        "source":                    t.source,
        "source_id":                 t.source_id,
        "source_metadata":           t.source_metadata,
        "created_at":                t.created_at.isoformat(),
        "updated_at":                t.updated_at.isoformat(),
    }


def _calendar_out(ev: CalendarEvent) -> dict[str, Any]:
    return {
        "id":             ev.id,
        "user_id":        ev.user_id,
        "title":          ev.title,
        "start_time":     ev.start_time,
        "end_time":       ev.end_time,
        "location":       ev.location,
        "source":         ev.source,
        "event_type":     ev.event_type,
        "linked_goal_id": ev.linked_goal_id,
        "linked_task_id": ev.linked_task_id,
        "created_at":     ev.created_at.isoformat(),
        "updated_at":     ev.updated_at.isoformat(),
    }


def _focus_block_out(fb: FocusBlock) -> dict[str, Any]:
    return {
        "id":              fb.id,
        "user_id":         fb.user_id,
        "title":           fb.title,
        "start_time":      fb.start_time,
        "end_time":        fb.end_time,
        "linked_goal_id":  fb.linked_goal_id,
        "linked_task_ids": fb.linked_task_ids or [],
        "status":          fb.status,
        "source":          fb.source,
        "notes":           fb.notes,
        "actual_start":    fb.actual_start,
        "actual_end":      fb.actual_end,
        "created_at":      fb.created_at.isoformat(),
        "updated_at":      fb.updated_at.isoformat(),
    }


def _window_suggested_use(minutes: int) -> str:
    if minutes < 30:
        return "Quick task or email check"
    if minutes < 60:
        return "Focus session or task completion"
    if minutes < 120:
        return "Deep work session"
    return "Extended work block"


def _window_confidence(minutes: int) -> float:
    """Longer windows are higher-confidence scheduling candidates."""
    if minutes >= 90:
        return 0.90
    if minutes >= 45:
        return 0.75
    if minutes >= 30:
        return 0.60
    return 0.40


# ── Service ────────────────────────────────────────────────────────────────────

class TaskGoalCalendarService:
    """
    Business logic for task/goal/calendar relationships.

    Instantiate with a SQLAlchemy Session. All mutating methods commit
    internally; callers should NOT call db.commit() after a service method.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Ownership helpers ──────────────────────────────────────────────────

    def _get_task(self, user_id: str, task_id: str) -> Task:
        t = self.db.execute(
            select(Task).where(Task.id == task_id, Task.user_id == user_id)
        ).scalar_one_or_none()
        if not t:
            raise RelationshipError(_TASK_NOT_FOUND, f"Task {task_id!r} not found.")
        return t

    def _get_goal(self, user_id: str, goal_id: str) -> Goal:
        g = self.db.execute(
            select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
        ).scalar_one_or_none()
        if not g:
            raise RelationshipError(_GOAL_NOT_FOUND, f"Goal {goal_id!r} not found.")
        return g

    def _get_focus_block(self, user_id: str, focus_block_id: str) -> FocusBlock:
        fb = self.db.execute(
            select(FocusBlock).where(
                FocusBlock.id == focus_block_id,
                FocusBlock.user_id == user_id,
            )
        ).scalar_one_or_none()
        if not fb:
            raise RelationshipError(_FOCUS_BLOCK_NOT_FOUND, f"FocusBlock {focus_block_id!r} not found.")
        return fb

    # ── Task ↔ Goal ────────────────────────────────────────────────────────

    def link_task_to_goal(
        self,
        user_id: str,
        task_id: str,
        goal_id: str,
        *,
        category: str | None = None,
    ) -> dict[str, Any]:
        """Link a task to a goal. Optionally sets a project/category label."""
        task = self._get_task(user_id, task_id)
        goal = self._get_goal(user_id, goal_id)

        if task.linked_goal_id == goal.id:
            raise RelationshipError(
                _RELATIONSHIP_EXISTS,
                f"Task {task_id!r} is already linked to goal {goal_id!r}.",
            )

        task.linked_goal_id = goal.id
        if category is not None:
            task.category = category
        task.updated_at = _now()
        self.db.commit()
        self.db.refresh(task)
        return _task_out(task)

    def unlink_task_from_goal(self, user_id: str, task_id: str) -> dict[str, Any]:
        """Remove a task's goal association."""
        task = self._get_task(user_id, task_id)

        if not task.linked_goal_id:
            raise RelationshipError(_NO_LINKED_GOAL, f"Task {task_id!r} has no linked goal.")

        task.linked_goal_id = None
        task.updated_at = _now()
        self.db.commit()
        self.db.refresh(task)
        return _task_out(task)

    # ── Task ↔ Calendar ────────────────────────────────────────────────────

    def schedule_task(
        self,
        user_id: str,
        task_id: str,
        start_time: str,
        end_time: str,
    ) -> dict[str, Any]:
        """
        Schedule a task into a calendar block.

        Creates a CalendarEvent of event_type='task_block' and links it back
        to the task. Returns {"task": ..., "calendar_event": ...}.

        Raises RelationshipError if the time range is invalid or conflicts
        with an existing event owned by this user.
        """
        start_dt = _parse_dt(start_time)
        end_dt   = _parse_dt(end_time)

        if end_dt <= start_dt:
            raise RelationshipError(_INVALID_TIME_RANGE, "end_time must be after start_time.")

        task = self._get_task(user_id, task_id)

        # Check for conflicts with existing events
        conflicts = self._find_conflicts(user_id, start_time, end_time, exclude_task_id=task_id)
        if conflicts:
            raise RelationshipError(
                _CALENDAR_CONFLICT,
                f"{len(conflicts)} calendar event(s) overlap the requested time.",
            )

        now = _now()
        # Remove any previous task_block for this task
        existing = self.db.execute(
            select(CalendarEvent).where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.linked_task_id == task_id,
                CalendarEvent.event_type == "task_block",
            )
        ).scalars().all()
        for ev in existing:
            self.db.delete(ev)

        event = CalendarEvent(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=task.title,
            start_time=start_time,
            end_time=end_time,
            source="manual",
            event_type="task_block",
            linked_task_id=task_id,
            linked_goal_id=task.linked_goal_id,
            created_at=now,
            updated_at=now,
        )
        self.db.add(event)

        task.scheduled_start = start_time
        task.scheduled_end   = end_time
        task.updated_at      = now
        self.db.commit()
        self.db.refresh(task)
        self.db.refresh(event)
        return {"task": _task_out(task), "calendar_event": _calendar_out(event)}

    def unschedule_task(self, user_id: str, task_id: str) -> dict[str, Any]:
        """Remove a task's scheduled time and delete its task_block calendar event."""
        task = self._get_task(user_id, task_id)

        existing = self.db.execute(
            select(CalendarEvent).where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.linked_task_id == task_id,
                CalendarEvent.event_type == "task_block",
            )
        ).scalars().all()
        for ev in existing:
            self.db.delete(ev)

        task.scheduled_start = None
        task.scheduled_end   = None
        task.updated_at      = _now()
        self.db.commit()
        self.db.refresh(task)
        return _task_out(task)

    # ── Focus Blocks ────────────────────────────────────────────────────────

    def create_focus_block(
        self,
        user_id: str,
        *,
        title: str,
        start_time: str,
        end_time: str,
        linked_goal_id: str | None = None,
        task_ids: list[str] | None = None,
        source: str = "manual",
        notes: str | None = None,
    ) -> dict[str, Any]:
        """
        Create a focus block and optionally assign tasks to it.

        Also creates a CalendarEvent of event_type='focus_block' so the block
        shows on the calendar.
        """
        start_dt = _parse_dt(start_time)
        end_dt   = _parse_dt(end_time)

        if end_dt <= start_dt:
            raise RelationshipError(_INVALID_TIME_RANGE, "end_time must be after start_time.")

        if linked_goal_id:
            self._get_goal(user_id, linked_goal_id)

        task_ids = task_ids or []
        tasks = []
        for tid in task_ids:
            tasks.append(self._get_task(user_id, tid))

        now = _now()
        fb = FocusBlock(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=title,
            start_time=start_time,
            end_time=end_time,
            linked_goal_id=linked_goal_id,
            linked_task_ids=task_ids,
            status="planned",
            source=source,
            notes=notes,
            created_at=now,
            updated_at=now,
        )
        self.db.add(fb)
        self.db.flush()  # get fb.id before creating the calendar event

        # Mirror the focus block on the calendar
        ev = CalendarEvent(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=title,
            start_time=start_time,
            end_time=end_time,
            source=source,
            event_type="focus_block",
            linked_goal_id=linked_goal_id,
            created_at=now,
            updated_at=now,
        )
        self.db.add(ev)

        # Assign tasks to the focus block
        for t in tasks:
            t.focus_block_id = fb.id
            t.updated_at = now

        self.db.commit()
        self.db.refresh(fb)
        return _focus_block_out(fb)

    def assign_tasks_to_focus_block(
        self,
        user_id: str,
        focus_block_id: str,
        task_ids: list[str],
    ) -> dict[str, Any]:
        """
        Assign (or replace) the set of tasks in a focus block.

        Previous tasks in the block are unlinked; the new set is linked.
        """
        fb = self._get_focus_block(user_id, focus_block_id)

        # Clear previous assignments that are not in the new list
        old_ids = set(fb.linked_task_ids or [])
        new_ids = set(task_ids)

        tasks_to_add = []
        for tid in new_ids:
            tasks_to_add.append(self._get_task(user_id, tid))

        now = _now()
        # Unlink removed tasks
        for tid in old_ids - new_ids:
            try:
                old_task = self._get_task(user_id, tid)
                if old_task.focus_block_id == focus_block_id:
                    old_task.focus_block_id = None
                    old_task.updated_at = now
            except RelationshipError:
                pass  # task may have been deleted

        for t in tasks_to_add:
            t.focus_block_id = focus_block_id
            t.updated_at = now

        fb.linked_task_ids = list(task_ids)
        fb.updated_at = now
        self.db.commit()
        self.db.refresh(fb)
        return _focus_block_out(fb)

    # ── Focus block status transitions ──────────────────────────────────────

    def start_focus_block(self, user_id: str, focus_block_id: str) -> dict[str, Any]:
        """
        Transition a focus block from planned → in_progress.

        Sets actual_start to the current UTC time. Raises if the block is
        already in_progress, completed, or cancelled.
        """
        fb = self._get_focus_block(user_id, focus_block_id)

        if fb.status != "planned":
            raise RelationshipError(
                _INVALID_STATUS_TRANSITION,
                f"Cannot start a focus block with status '{fb.status}'. "
                "Only 'planned' blocks can be started.",
            )

        now = _now()
        fb.status       = "in_progress"
        fb.actual_start = _fmt_dt(now)
        fb.updated_at   = now
        self.db.commit()
        self.db.refresh(fb)
        return _focus_block_out(fb)

    def update_focus_block_status(
        self,
        user_id: str,
        focus_block_id: str,
        new_status: str,
    ) -> dict[str, Any]:
        """
        Transition a focus block to any valid next status.

        Valid transitions::

            planned     → in_progress | cancelled
            in_progress → planned | completed | cancelled
            completed   → (terminal)
            cancelled   → (terminal)

        Sets actual_start when entering in_progress (if not already set).
        Sets actual_end when entering completed.
        Clears actual_start/actual_end when returning to planned.
        """
        fb = self._get_focus_block(user_id, focus_block_id)

        allowed = _VALID_TRANSITIONS.get(fb.status, frozenset())
        if new_status not in allowed:
            terminal = fb.status in ("completed", "cancelled")
            reason = (
                f"'{fb.status}' is a terminal state and cannot be changed."
                if terminal
                else f"'{fb.status}' → '{new_status}' is not a valid transition. "
                     f"Allowed: {sorted(allowed) or 'none'}."
            )
            raise RelationshipError(_INVALID_STATUS_TRANSITION, reason)

        now = _now()
        fb.status     = new_status
        fb.updated_at = now

        if new_status == "in_progress" and not fb.actual_start:
            fb.actual_start = _fmt_dt(now)
        elif new_status == "completed":
            fb.actual_end = _fmt_dt(now)
            if not fb.actual_start:
                fb.actual_start = _fmt_dt(now)
        elif new_status == "planned":
            fb.actual_start = None
            fb.actual_end   = None

        self.db.commit()
        self.db.refresh(fb)
        return _focus_block_out(fb)

    # ── Time suggestions ────────────────────────────────────────────────────

    def find_available_time_windows(
        self,
        user_id: str,
        target_date: date,
    ) -> list[dict[str, Any]]:
        """
        Return free time windows on a given date.

        The Real-Time Awareness Engine owns the calendar availability
        calculation so relationships, recommendations, Build My Day, widgets,
        and assistant context share the same free-window source.
        """
        from app.services.awareness_engine import RealTimeAwarenessEngine

        return RealTimeAwarenessEngine(self.db).find_available_time_windows(user_id, target_date)

    def suggest_time_for_task(self, user_id: str, task_id: str) -> dict[str, Any] | None:
        """
        Return the next available window that fits the task's estimated duration.

        Searches today first, then tomorrow, then next 5 days. Returns None if
        no window is found within 7 days.
        """
        task = self._get_task(user_id, task_id)
        needed = task.estimated_duration_minutes or 30

        for offset in range(7):
            target = date.today() + timedelta(days=offset)
            for window in self.find_available_time_windows(user_id, target):
                if window["duration_minutes"] >= needed:
                    return window

        return None

    def suggest_tasks_for_time_window(
        self,
        user_id: str,
        start_time: str,
        end_time: str,
    ) -> list[dict[str, Any]]:
        """
        Return unscheduled open tasks that fit within the given time window,
        ranked by priority.
        """
        available_minutes = _duration_minutes(start_time, end_time)

        rows = (
            self.db.execute(
                select(Task)
                .where(
                    Task.user_id == user_id,
                    Task.status.in_(["todo", "in_progress"]),
                    Task.scheduled_start.is_(None),
                )
                .order_by(Task.updated_at.desc())
            )
            .scalars()
            .all()
        )

        # Sort by priority, then include tasks that fit in the window
        order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        ranked = sorted(rows, key=lambda t: order.get(t.priority, 2))

        result = []
        for t in ranked:
            duration = t.estimated_duration_minutes or 30
            if duration <= available_minutes:
                result.append(_task_out(t))

        return result

    # ── Goal progress ────────────────────────────────────────────────────────

    def calculate_goal_progress_from_tasks(
        self, user_id: str, goal_id: str
    ) -> dict[str, Any]:
        """
        Compute goal completion as (done tasks / total linked tasks).

        Returns computed_progress separately from manual_progress so callers
        can choose which to display.
        """
        goal = self._get_goal(user_id, goal_id)

        linked_tasks = (
            self.db.execute(
                select(Task).where(
                    Task.user_id == user_id,
                    Task.linked_goal_id == goal_id,
                )
            )
            .scalars()
            .all()
        )

        total       = len(linked_tasks)
        done        = sum(1 for t in linked_tasks if t.status == "done")
        in_progress = sum(1 for t in linked_tasks if t.status == "in_progress")
        todo        = total - done - in_progress

        computed = round(done / total, 4) if total > 0 else 0.0
        effective = goal.manual_progress if goal.manual_progress is not None else computed

        return {
            "goal_id":           goal_id,
            "goal_title":        goal.title,
            "total_tasks":       total,
            "completed_tasks":   done,
            "in_progress_tasks": in_progress,
            "todo_tasks":        todo,
            "computed_progress": computed,
            "manual_progress":   goal.manual_progress,
            "effective_progress": effective,
        }

    def get_goal_workload(self, user_id: str, goal_id: str) -> dict[str, Any]:
        """Return task count breakdown and schedule coverage for a goal."""
        goal = self._get_goal(user_id, goal_id)

        tasks = (
            self.db.execute(
                select(Task).where(
                    Task.user_id == user_id,
                    Task.linked_goal_id == goal_id,
                )
            )
            .scalars()
            .all()
        )
        total     = len(tasks)
        scheduled = sum(1 for t in tasks if t.scheduled_start)
        by_status = {
            "todo":        sum(1 for t in tasks if t.status == "todo"),
            "in_progress": sum(1 for t in tasks if t.status == "in_progress"),
            "done":        sum(1 for t in tasks if t.status == "done"),
        }
        by_priority = {
            "critical": sum(1 for t in tasks if t.priority == "critical"),
            "high":     sum(1 for t in tasks if t.priority == "high"),
            "medium":   sum(1 for t in tasks if t.priority == "medium"),
            "low":      sum(1 for t in tasks if t.priority == "low"),
        }
        return {
            "goal_id":     goal_id,
            "goal_title":  goal.title,
            "total_tasks": total,
            "scheduled":   scheduled,
            "unscheduled": total - scheduled,
            "by_status":   by_status,
            "by_priority": by_priority,
        }

    # ── Next Best Action ─────────────────────────────────────────────────────

    def get_next_best_action(self, user_id: str) -> dict[str, Any]:
        """
        Recommend the single most valuable next action for this user.

        HELIOS V3 centralizes recommendation scoring in PriorityEngine so
        every surface has the same answer for "what should I do next?"
        """
        from app.services.priority_engine import PriorityEngine
        return PriorityEngine(self.db).get_next_best_action(user_id)

    # ── Relationship diagnostics ─────────────────────────────────────────────

    def detect_unscheduled_important_tasks(self, user_id: str) -> list[dict[str, Any]]:
        """Return high/critical open tasks that have no scheduled time block."""
        rows = (
            self.db.execute(
                select(Task)
                .where(
                    Task.user_id == user_id,
                    Task.status.in_(["todo", "in_progress"]),
                    Task.priority.in_(["high", "critical"]),
                    Task.scheduled_start.is_(None),
                )
                .order_by(Task.due_date.asc().nulls_last())
            )
            .scalars()
            .all()
        )
        return [
            {"id": t.id, "title": t.title, "detail": f"priority={t.priority}, due={t.due_date}"}
            for t in rows
        ]

    def detect_goals_without_scheduled_time(self, user_id: str) -> list[dict[str, Any]]:
        """
        Return active goals that have no linked tasks with a scheduled time,
        and no focus blocks pointing at them.
        """
        goals = (
            self.db.execute(
                select(Goal).where(Goal.user_id == user_id, Goal.status == "active")
            )
            .scalars()
            .all()
        )

        result = []
        for g in goals:
            has_scheduled_task = self.db.execute(
                select(Task).where(
                    Task.user_id == user_id,
                    Task.linked_goal_id == g.id,
                    Task.scheduled_start.is_not(None),
                )
            ).scalar_one_or_none()

            has_focus_block = self.db.execute(
                select(FocusBlock).where(
                    FocusBlock.user_id == user_id,
                    FocusBlock.linked_goal_id == g.id,
                    FocusBlock.status.in_(["planned", "in_progress"]),
                )
            ).scalar_one_or_none()

            if not has_scheduled_task and not has_focus_block:
                result.append({
                    "id":     g.id,
                    "title":  g.title,
                    "detail": f"target_date={g.target_date}",
                })

        return result

    def detect_calendar_conflicts(
        self,
        user_id: str,
        target_date: date | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return pairs of calendar events that overlap in time.

        If target_date is None, checks today's events.
        """
        day = target_date or date.today()
        day_start = _fmt_dt(datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=timezone.utc))
        day_end   = _fmt_dt(datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc))

        events = (
            self.db.execute(
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

        conflicts: list[dict[str, Any]] = []
        for i, ev1 in enumerate(events):
            for ev2 in events[i + 1:]:
                if _events_overlap(ev1.start_time, ev1.end_time, ev2.start_time, ev2.end_time):
                    conflicts.append({
                        "event_a": {"id": ev1.id, "title": ev1.title, "start": ev1.start_time, "end": ev1.end_time},
                        "event_b": {"id": ev2.id, "title": ev2.title, "start": ev2.start_time, "end": ev2.end_time},
                    })

        return conflicts

    def get_relationship_health(self, user_id: str) -> dict[str, Any]:
        """
        Aggregate all diagnostic checks into a single structured health report.
        """
        goals = (
            self.db.execute(
                select(Goal).where(Goal.user_id == user_id, Goal.status == "active")
            )
            .scalars()
            .all()
        )
        all_tasks = (
            self.db.execute(
                select(Task).where(
                    Task.user_id == user_id,
                    Task.status.in_(["todo", "in_progress"]),
                )
            )
            .scalars()
            .all()
        )

        # Goals without any linked task
        goal_ids_with_tasks: set[str] = {
            t.linked_goal_id for t in all_tasks if t.linked_goal_id
        }
        goals_without_tasks = [
            {"id": g.id, "title": g.title, "detail": None}
            for g in goals
            if g.id not in goal_ids_with_tasks
        ]

        # High-priority tasks without goals
        hp_without_goals = [
            {"id": t.id, "title": t.title, "detail": f"priority={t.priority}"}
            for t in all_tasks
            if t.priority in ("high", "critical") and not t.linked_goal_id
        ]

        # Overdue tasks without a scheduled slot
        today = date.today().isoformat()
        unscheduled_overdue = [
            {"id": t.id, "title": t.title, "detail": f"due={t.due_date}"}
            for t in all_tasks
            if t.due_date and t.due_date < today and not t.scheduled_start
        ]

        goals_no_schedule = self.detect_goals_without_scheduled_time(user_id)
        conflicts         = self.detect_calendar_conflicts(user_id)

        summary = {
            "goals_without_tasks":             len(goals_without_tasks),
            "high_priority_tasks_without_goals": len(hp_without_goals),
            "goals_without_scheduled_time":    len(goals_no_schedule),
            "unscheduled_overdue_tasks":       len(unscheduled_overdue),
            "calendar_conflicts_today":        len(conflicts),
        }

        return {
            "goals_without_tasks":             goals_without_tasks,
            "high_priority_tasks_without_goals": hp_without_goals,
            "goals_without_scheduled_time":    goals_no_schedule,
            "unscheduled_overdue_tasks":       unscheduled_overdue,
            "calendar_conflicts":              conflicts,
            "summary":                         summary,
        }

    # ── Internal helpers ─────────────────────────────────────────────────────

    def _find_conflicts(
        self,
        user_id: str,
        start_time: str,
        end_time: str,
        *,
        exclude_task_id: str | None = None,
    ) -> list[CalendarEvent]:
        """Return existing events that overlap (start_time, end_time)."""
        rows = (
            self.db.execute(
                select(CalendarEvent).where(
                    CalendarEvent.user_id == user_id,
                    CalendarEvent.start_time < end_time,
                    CalendarEvent.end_time   > start_time,
                )
            )
            .scalars()
            .all()
        )
        if exclude_task_id:
            rows = [r for r in rows if r.linked_task_id != exclude_task_id]
        return rows
