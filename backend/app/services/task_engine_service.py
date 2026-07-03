from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.assistant_context_service import AssistantContextService
from app.models.calendar import CalendarEvent
from app.models.daily_history import DailyHistory
from app.models.email import EmailMessage
from app.models.goal import Goal
from app.models.task import Task
from app.models.task_suggestion import TaskSuggestion
from app.services.priority_engine import PriorityEngine
from app.services.semantic_memory_service import SemanticMemoryService
from app.services.task_goal_calendar_service import RelationshipError, TaskGoalCalendarService

logger = logging.getLogger(__name__)

ACTIVE_GOAL_STATUSES = {"active", "in_progress", "in-progress", "Active", "In Progress"}
OPEN_TASK_STATUSES = {"todo", "in_progress", "in-progress"}
DONE_TASK_STATUSES = {"done", "completed"}
VALID_SOURCES = {
    "email", "gmail", "outlook", "outlook_mail", "apple_mail",
    "calendar", "goals", "daily_brief", "assistant_context", "next_best_action",
}


class TaskEngineError(Exception):
    def __init__(self, code: str, detail: str = "") -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


@dataclass
class SuggestionDraft:
    title: str
    description: str | None
    priority: str
    due_date: str | None
    estimated_duration_minutes: int | None
    category: str | None
    source_type: str
    source_id: str | None
    source_metadata: dict[str, Any] | None
    linked_goal_id: str | None
    confidence: float
    reason: str | None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return date.today()


def _iso_date(value: date | None = None) -> str:
    return (value or _today()).isoformat()


def _parse_date(value: str | None) -> date:
    if not value:
        return _today()
    try:
        return date.fromisoformat(value[:10])
    except ValueError as exc:
        raise TaskEngineError("invalid_date", "Date must use YYYY-MM-DD format.") from exc


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _fmt_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _day_bounds(target: date) -> tuple[str, str]:
    start = datetime.combine(target, time.min, tzinfo=timezone.utc)
    end = datetime.combine(target, time.max, tzinfo=timezone.utc)
    return _fmt_dt(start), _fmt_dt(end)


def _safe_text(value: str | None, limit: int = 240) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    return text[:limit] if len(text) <= limit else text[: limit - 1] + "…"


def _task_to_dict(task: Task) -> dict[str, Any]:
    return {
        "id": task.id,
        "user_id": task.user_id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "linked_goal_id": task.linked_goal_id,
        "estimated_duration_minutes": task.estimated_duration_minutes,
        "category": task.category,
        "scheduled_start": task.scheduled_start,
        "scheduled_end": task.scheduled_end,
        "focus_block_id": task.focus_block_id,
        "source": task.source,
        "source_id": task.source_id,
        "source_metadata": task.source_metadata,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


def _suggestion_to_dict(suggestion: TaskSuggestion) -> dict[str, Any]:
    return {
        "id": suggestion.id,
        "user_id": suggestion.user_id,
        "title": suggestion.title,
        "description": suggestion.description,
        "status": suggestion.status,
        "priority": suggestion.priority,
        "due_date": suggestion.due_date,
        "estimated_duration_minutes": suggestion.estimated_duration_minutes,
        "category": suggestion.category,
        "source_type": suggestion.source_type,
        "source_id": suggestion.source_id,
        "source_metadata": suggestion.source_metadata,
        "linked_goal_id": suggestion.linked_goal_id,
        "confidence": suggestion.confidence,
        "reason": suggestion.reason,
        "accepted_task_id": suggestion.accepted_task_id,
        "rejected_reason": suggestion.rejected_reason,
        "created_at": suggestion.created_at.isoformat(),
        "updated_at": suggestion.updated_at.isoformat(),
        "accepted_at": suggestion.accepted_at.isoformat() if suggestion.accepted_at else None,
        "rejected_at": suggestion.rejected_at.isoformat() if suggestion.rejected_at else None,
    }


class TaskEngineService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_suggestions(
        self,
        user_id: str,
        *,
        status: str = "pending",
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        rows = (
            self.db.execute(
                select(TaskSuggestion)
                .where(TaskSuggestion.user_id == user_id, TaskSuggestion.status == status)
                .order_by(TaskSuggestion.confidence.desc(), TaskSuggestion.created_at.desc())
                .limit(limit)
            )
            .scalars()
            .all()
        )
        return [_suggestion_to_dict(row) for row in rows]

    def generate_suggestions(
        self,
        user_id: str,
        *,
        sources: list[str] | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        selected = set(sources or VALID_SOURCES)
        unknown = selected - VALID_SOURCES
        if unknown:
            raise TaskEngineError("invalid_source", f"Unsupported source(s): {', '.join(sorted(unknown))}.")

        priority_engine = PriorityEngine(self.db)
        priority_context = priority_engine.build_priority_context(user_id)
        draft_payloads = priority_engine.build_task_suggestion_drafts(
            user_id,
            sources=selected,
            limit=limit,
        )
        drafts = [SuggestionDraft(**payload) for payload in draft_payloads]

        created_or_updated: list[TaskSuggestion] = []
        for draft in drafts[:limit]:
            suggestion = self._upsert_suggestion(user_id, draft)
            if suggestion:
                created_or_updated.append(suggestion)

        next_best = priority_context.get("next_best_action") or priority_engine.get_next_best_action(user_id)
        return {
            "suggestions": [_suggestion_to_dict(row) for row in created_or_updated],
            "next_best_action": next_best,
            "recommendations": list(priority_context.get("recommendations") or [])[:limit],
            "generated": len(created_or_updated),
        }

    def build_day(
        self,
        user_id: str,
        *,
        schedule_date: str | None = None,
        commit: bool = True,
        max_items: int = 8,
    ) -> dict[str, Any]:
        target = _parse_date(schedule_date)
        return PriorityEngine(self.db).build_day_schedule(
            user_id,
            target,
            commit=commit,
            max_items=max_items,
        )

    def accept_suggestion(
        self,
        user_id: str,
        suggestion_id: str,
        *,
        schedule: bool = False,
        schedule_date: str | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
    ) -> dict[str, Any]:
        suggestion = self._get_suggestion(user_id, suggestion_id)
        if suggestion.status == "accepted" and suggestion.accepted_task_id:
            task = self._get_task(user_id, suggestion.accepted_task_id)
            return {
                "suggestion": _suggestion_to_dict(suggestion),
                "task": _task_to_dict(task),
                "calendar_event": None,
                "goal_progress": self._goal_progress(user_id, task.linked_goal_id),
            }
        if suggestion.status == "rejected":
            raise TaskEngineError("suggestion_rejected", "Rejected suggestions cannot be accepted.")

        now = _now()
        task = Task(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=suggestion.title,
            description=suggestion.description,
            status="todo",
            priority=suggestion.priority,
            due_date=suggestion.due_date,
            linked_goal_id=suggestion.linked_goal_id,
            estimated_duration_minutes=suggestion.estimated_duration_minutes,
            category=suggestion.category,
            source=suggestion.source_type,
            source_id=suggestion.source_id,
            source_metadata={
                **(suggestion.source_metadata or {}),
                "suggestion_id": suggestion.id,
                "accepted_at": now.isoformat(),
            },
            created_at=now,
            updated_at=now,
        )
        self.db.add(task)
        suggestion.status = "accepted"
        suggestion.accepted_task_id = task.id
        suggestion.accepted_at = now
        suggestion.updated_at = now
        self.db.commit()
        self.db.refresh(task)
        self.db.refresh(suggestion)
        self._index_task(task)

        calendar_event = None
        if schedule:
            scheduled = self.schedule_task(
                user_id,
                task.id,
                schedule_date=schedule_date,
                start_time=start_time,
                end_time=end_time,
            )
            task = self._get_task(user_id, task.id)
            calendar_event = scheduled["calendar_event"]

        return {
            "suggestion": _suggestion_to_dict(suggestion),
            "task": _task_to_dict(task),
            "calendar_event": calendar_event,
            "goal_progress": self._goal_progress(user_id, task.linked_goal_id),
        }

    def reject_suggestion(
        self,
        user_id: str,
        suggestion_id: str,
        *,
        reason: str | None = None,
    ) -> dict[str, Any]:
        suggestion = self._get_suggestion(user_id, suggestion_id)
        if suggestion.status == "accepted":
            raise TaskEngineError("suggestion_accepted", "Accepted suggestions cannot be rejected.")
        now = _now()
        suggestion.status = "rejected"
        suggestion.rejected_reason = _safe_text(reason, 500)
        suggestion.rejected_at = now
        suggestion.updated_at = now
        self.db.commit()
        self.db.refresh(suggestion)
        return _suggestion_to_dict(suggestion)

    def schedule_task(
        self,
        user_id: str,
        task_id: str,
        *,
        schedule_date: str | None = None,
        start_time: str | None = None,
        end_time: str | None = None,
    ) -> dict[str, Any]:
        task = self._get_task(user_id, task_id)
        selected_window = None
        if bool(start_time) != bool(end_time):
            raise TaskEngineError("invalid_time_range", "Provide both start_time and end_time.")
        if not start_time or not end_time:
            target = _parse_date(schedule_date)
            selected_window = self._select_window_for_task(user_id, task, target)
            if not selected_window:
                raise TaskEngineError("no_available_window", "No available calendar window fits this task.")
            start_time = selected_window["start_time"]
            end_time = selected_window["end_time"]

        result = TaskGoalCalendarService(self.db).schedule_task(user_id, task_id, start_time, end_time)
        scheduled_task = self._get_task(user_id, task_id)
        self._index_task(scheduled_task)
        return {
            "task": _task_to_dict(scheduled_task),
            "calendar_event": result["calendar_event"],
            "selected_window": selected_window,
        }

    def complete_task(self, user_id: str, task_id: str) -> dict[str, Any]:
        task = self._get_task(user_id, task_id)
        now = _now()
        metadata = dict(task.source_metadata or {})
        metadata["completed_at"] = now.isoformat()
        task.status = "done"
        task.source_metadata = metadata
        task.updated_at = now
        self.db.commit()
        self.db.refresh(task)

        daily_history_updated = self._record_completed_task(user_id, task)
        goal_progress = self._refresh_goal_progress(user_id, task.linked_goal_id)
        self._index_task(task)
        return {
            "task": _task_to_dict(task),
            "daily_history_updated": daily_history_updated,
            "goal_progress": goal_progress,
        }

    def _gmail_suggestions(self, user_id: str) -> list[SuggestionDraft]:
        rows = (
            self.db.execute(
                select(EmailMessage)
                .where(
                    EmailMessage.user_id == user_id,
                    EmailMessage.source == "gmail",
                    EmailMessage.status.in_(["unread", "read"]),
                )
                .order_by(EmailMessage.received_at.desc())
                .limit(40)
            )
            .scalars()
            .all()
        )
        drafts: list[SuggestionDraft] = []
        for message in rows:
            labels = set(message.labels or [])
            important = message.status == "unread" or message.importance in {"urgent", "high"} or "IMPORTANT" in labels
            if not important:
                continue
            subject = _safe_text(message.subject, 90) or "Gmail item"
            verb = "Reply to" if self._looks_actionable_email(message) else "Review"
            priority = "high" if message.importance in {"urgent", "high"} or message.status == "unread" else "medium"
            drafts.append(SuggestionDraft(
                title=f"{verb} email: {subject}",
                description=_safe_text(message.snippet, 500),
                priority=priority,
                due_date=_iso_date(),
                estimated_duration_minutes=20 if verb == "Reply to" else 10,
                category="Email",
                source_type="gmail",
                source_id=message.external_message_id or message.id,
                source_metadata={
                    "email_message_id": message.id,
                    "sender": _safe_text(message.sender, 180),
                    "subject": _safe_text(message.subject, 220),
                    "snippet": _safe_text(message.snippet, 220),
                    "received_at": message.received_at,
                    "importance": message.importance,
                    "status": message.status,
                    "labels": list(message.labels or [])[:8],
                },
                linked_goal_id=None,
                confidence=0.82 if message.status == "unread" else 0.68,
                reason="Important Gmail item that may require action.",
            ))
        return drafts

    def _calendar_suggestions(self, user_id: str) -> list[SuggestionDraft]:
        now = _now()
        upcoming_end = now + timedelta(days=7)
        past_start = now - timedelta(days=2)
        rows = (
            self.db.execute(
                select(CalendarEvent)
                .where(
                    CalendarEvent.user_id == user_id,
                    or_(
                        CalendarEvent.event_type.is_(None),
                        CalendarEvent.event_type.not_in(["task_block", "focus_block"]),
                    ),
                    CalendarEvent.start_time <= _fmt_dt(upcoming_end),
                    CalendarEvent.end_time >= _fmt_dt(past_start),
                )
                .order_by(CalendarEvent.start_time)
                .limit(50)
            )
            .scalars()
            .all()
        )
        drafts: list[SuggestionDraft] = []
        for event in rows:
            start = _parse_datetime(event.start_time)
            end = _parse_datetime(event.end_time)
            if not start or not end:
                continue
            metadata = {
                "calendar_event_id": event.id,
                "title": event.title,
                "start_time": event.start_time,
                "end_time": event.end_time,
                "source": event.source,
                "location": _safe_text(event.location, 220),
            }
            if start >= now:
                drafts.append(SuggestionDraft(
                    title=f"Prepare for {event.title}",
                    description=_safe_text(event.description, 500) or "Review notes, agenda, and any materials before this event.",
                    priority="high" if start <= now + timedelta(days=1) else "medium",
                    due_date=start.date().isoformat(),
                    estimated_duration_minutes=30,
                    category="Calendar Prep",
                    source_type="calendar",
                    source_id=event.external_event_id or event.id,
                    source_metadata=metadata,
                    linked_goal_id=event.linked_goal_id,
                    confidence=0.78,
                    reason="Upcoming calendar event benefits from preparation.",
                ))
            elif end <= now:
                drafts.append(SuggestionDraft(
                    title=f"Follow up on {event.title}",
                    description="Capture decisions, send follow-ups, and turn outcomes into tasks if needed.",
                    priority="medium",
                    due_date=_iso_date(),
                    estimated_duration_minutes=20,
                    category="Calendar Follow-up",
                    source_type="calendar",
                    source_id=event.external_event_id or event.id,
                    source_metadata=metadata,
                    linked_goal_id=event.linked_goal_id,
                    confidence=0.66,
                    reason="Recent calendar event may need follow-up.",
                ))
        return drafts

    def _goal_suggestions(self, user_id: str) -> list[SuggestionDraft]:
        goals = (
            self.db.execute(
                select(Goal)
                .where(Goal.user_id == user_id, Goal.status.in_(ACTIVE_GOAL_STATUSES))
                .order_by(Goal.updated_at.desc())
                .limit(12)
            )
            .scalars()
            .all()
        )
        drafts: list[SuggestionDraft] = []
        for goal in goals:
            linked_tasks = (
                self.db.execute(
                    select(Task).where(Task.user_id == user_id, Task.linked_goal_id == goal.id)
                )
                .scalars()
                .all()
            )
            open_count = sum(1 for task in linked_tasks if task.status in OPEN_TASK_STATUSES)
            if open_count > 0:
                continue
            due_date = goal.target_date[:10] if goal.target_date else (_today() + timedelta(days=2)).isoformat()
            drafts.append(SuggestionDraft(
                title=f"Define next milestone for {goal.title}",
                description=_safe_text(goal.description, 500) or "Create the next concrete milestone that moves this goal forward.",
                priority=goal.priority or "medium",
                due_date=due_date,
                estimated_duration_minutes=45,
                category="Goal Milestone",
                source_type="goals",
                source_id=goal.id,
                source_metadata={
                    "goal_id": goal.id,
                    "goal_title": goal.title,
                    "target_date": goal.target_date,
                    "status": goal.status,
                    "linked_task_count": len(linked_tasks),
                },
                linked_goal_id=goal.id,
                confidence=0.74,
                reason="Active goal has no open milestone tasks.",
            ))
        return drafts

    def _daily_brief_suggestions(self, user_id: str) -> list[SuggestionDraft]:
        history = self.db.execute(
            select(DailyHistory).where(
                DailyHistory.user_id == user_id,
                DailyHistory.history_date == _today(),
            )
        ).scalar_one_or_none()
        brief = history.daily_brief if history and isinstance(history.daily_brief, dict) else {}
        next_action = brief.get("next_best_action") if isinstance(brief, dict) else None
        if not isinstance(next_action, dict) or not next_action.get("title"):
            return []
        if next_action.get("linked_task_id"):
            return []
        return [SuggestionDraft(
            title=str(next_action["title"])[:200],
            description=_safe_text(next_action.get("reason"), 500),
            priority="high" if (next_action.get("confidence") or 0) >= 0.75 else "medium",
            due_date=_iso_date(),
            estimated_duration_minutes=next_action.get("estimated_duration_minutes") or 30,
            category="Daily Brief",
            source_type="daily_brief",
            source_id=history.id if history else _iso_date(),
            source_metadata={
                "history_id": history.id if history else None,
                "brief_date": _iso_date(),
                "next_best_action": next_action,
            },
            linked_goal_id=next_action.get("linked_goal_id"),
            confidence=float(next_action.get("confidence") or 0.62),
            reason="Daily Brief identified this as a useful next step.",
        )]

    def _assistant_context_suggestions(self, user_id: str) -> list[SuggestionDraft]:
        try:
            context = AssistantContextService(self.db).build_context_for_message(
                user_id,
                "What tasks should HELIOS suggest from my current context?",
                context_type="tasks",
            )
        except Exception:
            logger.warning("task_engine.assistant_context_failed user_id=%s", user_id, exc_info=True)
            return []
        priorities = context.get("current_priorities") or []
        if not priorities:
            return []
        item = priorities[0]
        if item.get("id"):
            return []
        return [SuggestionDraft(
            title=_safe_text(item.get("title"), 180) or "Review current priorities",
            description="Assistant context surfaced this priority from your current HELIOS state.",
            priority=item.get("priority") or "medium",
            due_date=item.get("due_date") or _iso_date(),
            estimated_duration_minutes=30,
            category="Assistant Context",
            source_type="assistant_context",
            source_id=_iso_date(),
            source_metadata={"priority": item, "sources_used": context.get("retrieval_metadata", {}).get("sources_used", [])},
            linked_goal_id=item.get("linked_goal_id"),
            confidence=0.58,
            reason="Assistant context retrieval surfaced this priority.",
        )]

    def _next_best_action_suggestions(self, user_id: str) -> list[SuggestionDraft]:
        action = TaskGoalCalendarService(self.db).get_next_best_action(user_id)
        if action.get("type") == "none" or action.get("linked_task_id"):
            return []
        return [SuggestionDraft(
            title=str(action.get("title") or "Create next best action")[:200],
            description=_safe_text(action.get("reason"), 500),
            priority="high",
            due_date=_iso_date(),
            estimated_duration_minutes=action.get("estimated_duration_minutes") or 30,
            category="Next Best Action",
            source_type="next_best_action",
            source_id=action.get("linked_goal_id") or _iso_date(),
            source_metadata=action,
            linked_goal_id=action.get("linked_goal_id"),
            confidence=float(action.get("confidence") or 0.55),
            reason="Relationship logic recommends this as the next best action.",
        )]

    def _looks_actionable_email(self, message: EmailMessage) -> bool:
        haystack = f"{message.subject or ''} {message.snippet or ''}".lower()
        signals = ("reply", "respond", "question", "approve", "confirm", "review", "action required", "please")
        return any(signal in haystack for signal in signals)

    def _rank_drafts(self, drafts: list[SuggestionDraft]) -> list[SuggestionDraft]:
        priority_score = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        seen: set[tuple[str, str | None, str]] = set()
        deduped: list[SuggestionDraft] = []
        for draft in drafts:
            key = (draft.source_type, draft.source_id, draft.title.lower())
            if key in seen:
                continue
            seen.add(key)
            deduped.append(draft)
        return sorted(
            deduped,
            key=lambda draft: (
                -draft.confidence,
                -priority_score.get(draft.priority, 2),
                draft.due_date or "9999-99-99",
            ),
        )

    def _upsert_suggestion(self, user_id: str, draft: SuggestionDraft) -> TaskSuggestion | None:
        existing = self._find_matching_suggestion(user_id, draft)
        now = _now()
        if existing:
            if existing.status != "pending":
                return None
            existing.description = draft.description
            existing.priority = draft.priority
            existing.due_date = draft.due_date
            existing.estimated_duration_minutes = draft.estimated_duration_minutes
            existing.category = draft.category
            existing.source_metadata = draft.source_metadata
            existing.linked_goal_id = draft.linked_goal_id
            existing.confidence = draft.confidence
            existing.reason = draft.reason
            existing.updated_at = now
            self.db.commit()
            self.db.refresh(existing)
            return existing

        suggestion = TaskSuggestion(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=draft.title[:200],
            description=draft.description,
            status="pending",
            priority=draft.priority,
            due_date=draft.due_date,
            estimated_duration_minutes=draft.estimated_duration_minutes,
            category=draft.category,
            source_type=draft.source_type,
            source_id=draft.source_id,
            source_metadata=draft.source_metadata,
            linked_goal_id=draft.linked_goal_id,
            confidence=max(0.0, min(draft.confidence, 1.0)),
            reason=draft.reason,
            created_at=now,
            updated_at=now,
        )
        self.db.add(suggestion)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return self._find_matching_suggestion(user_id, draft)
        self.db.refresh(suggestion)
        return suggestion

    def _find_matching_suggestion(self, user_id: str, draft: SuggestionDraft) -> TaskSuggestion | None:
        return self.db.execute(
            select(TaskSuggestion).where(
                TaskSuggestion.user_id == user_id,
                TaskSuggestion.source_type == draft.source_type,
                TaskSuggestion.source_id == draft.source_id,
                TaskSuggestion.title == draft.title[:200],
            )
        ).scalar_one_or_none()

    def _get_suggestion(self, user_id: str, suggestion_id: str) -> TaskSuggestion:
        suggestion = self.db.execute(
            select(TaskSuggestion).where(
                TaskSuggestion.id == suggestion_id,
                TaskSuggestion.user_id == user_id,
            )
        ).scalar_one_or_none()
        if not suggestion:
            raise TaskEngineError("suggestion_not_found", "Task suggestion not found.")
        return suggestion

    def _get_task(self, user_id: str, task_id: str) -> Task:
        task = self.db.execute(
            select(Task).where(Task.id == task_id, Task.user_id == user_id)
        ).scalar_one_or_none()
        if not task:
            raise TaskEngineError("task_not_found", "Task not found.")
        return task

    def _select_window_for_task(self, user_id: str, task: Task, target: date) -> dict[str, Any] | None:
        needed = task.estimated_duration_minutes or 30
        windows = TaskGoalCalendarService(self.db).find_available_time_windows(user_id, target)
        candidates = [window for window in windows if window.get("duration_minutes", 0) >= needed]
        if not candidates:
            return None
        return max(candidates, key=lambda window: (window.get("confidence", 0), window.get("duration_minutes", 0)))

    def _record_completed_task(self, user_id: str, task: Task) -> bool:
        target = _today()
        now = _now()
        history = self.db.execute(
            select(DailyHistory).where(
                DailyHistory.user_id == user_id,
                DailyHistory.history_date == target,
            )
        ).scalar_one_or_none()
        if history is None:
            history = DailyHistory(
                id=str(uuid.uuid4()),
                user_id=user_id,
                history_date=target,
                timezone="UTC",
                day_type="today",
                status="open",
                completed_tasks=[],
                planned_tasks=[],
                overdue_tasks=[],
                goals_snapshot=[],
                calendar_events=[],
                focus_blocks=[],
                assistant_activity=[],
                integration_activity=[],
                created_at=now,
                updated_at=now,
            )
            self.db.add(history)
        if history.status == "locked":
            return False
        completed = [item for item in (history.completed_tasks or []) if item.get("id") != task.id]
        completed.append({
            "id": task.id,
            "title": task.title,
            "completed_at": now.isoformat(),
            "linked_goal_id": task.linked_goal_id,
            "source": task.source,
            "category": task.category,
        })
        history.completed_tasks = completed
        history.planned_tasks = [
            item for item in (history.planned_tasks or [])
            if item.get("id") != task.id and item.get("title") != task.title
        ]
        history.updated_at = now
        self.db.commit()
        return True

    def _refresh_goal_progress(self, user_id: str, goal_id: str | None) -> dict[str, Any] | None:
        if not goal_id:
            return None
        svc = TaskGoalCalendarService(self.db)
        progress = svc.calculate_goal_progress_from_tasks(user_id, goal_id)
        goal = self.db.execute(
            select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
        ).scalar_one_or_none()
        if goal and goal.manual_progress is None:
            goal.manual_progress = progress["computed_progress"]
            goal.updated_at = _now()
            self.db.commit()
            progress = svc.calculate_goal_progress_from_tasks(user_id, goal_id)
        return progress

    def _goal_progress(self, user_id: str, goal_id: str | None) -> dict[str, Any] | None:
        if not goal_id:
            return None
        try:
            return TaskGoalCalendarService(self.db).calculate_goal_progress_from_tasks(user_id, goal_id)
        except RelationshipError:
            return None

    def _index_task(self, task: Task) -> None:
        try:
            SemanticMemoryService(self.db).index_task(task)
        except Exception:
            self.db.rollback()
            logger.warning("task_engine.semantic_task_index_failed task_id=%s", task.id, exc_info=True)
