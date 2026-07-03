from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.models.calendar import CalendarEvent
from app.models.daily_history import DailyHistory
from app.models.daily_snapshot import DailyMemorySnapshot
from app.models.email import EmailMessage
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.schemas.daily_brief import DailyBriefOut
from app.services.awareness_engine import RealTimeAwarenessEngine
from app.services.priority_engine import PriorityEngine
from app.services.semantic_memory_service import SemanticMemoryService
from app.services.task_goal_calendar_service import TaskGoalCalendarService

logger = logging.getLogger(__name__)

ACTIVE_GOAL_STATUSES = {"active", "in_progress", "in-progress", "Active", "In Progress"}
OPEN_TASK_STATUSES = {"todo", "in_progress", "in-progress"}
DONE_TASK_STATUSES = {"done", "completed"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return _utc_now().date()


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _day_bounds(target: date) -> tuple[str, str]:
    start = datetime.combine(target, time.min, tzinfo=timezone.utc)
    end = datetime.combine(target, time.max, tzinfo=timezone.utc)
    return _iso(start), _iso(end)


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _date_part(value: str | None) -> str | None:
    if not value:
        return None
    parsed = _parse_datetime(value)
    if parsed:
        return parsed.date().isoformat()
    return str(value)[:10]


def _safe_text(value: str | None, limit: int = 240) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    return text[:limit] if len(text) <= limit else text[: limit - 1] + "…"


def _event_to_dict(event: CalendarEvent, *, category: str) -> dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "location": event.location,
        "source": event.source,
        "event_type": event.event_type or "event",
        "category": category,
        "linked_goal_id": event.linked_goal_id,
        "linked_task_id": event.linked_task_id,
    }


def _email_to_dict(message: EmailMessage) -> dict[str, Any]:
    return {
        "id": message.id,
        "sender": _safe_text(message.sender, 180),
        "subject": _safe_text(message.subject, 220) or "(No subject)",
        "snippet": _safe_text(message.snippet, 220),
        "received_at": message.received_at,
        "importance": message.importance,
        "status": message.status,
        "source": message.source,
        "has_attachments": message.has_attachments,
        "labels": list(message.labels or [])[:8],
    }


def _task_to_dict(task: Task, *, category: str) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "description": _safe_text(task.description, 180),
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "estimated_duration_minutes": task.estimated_duration_minutes,
        "category": task.category or category,
        "linked_goal_id": task.linked_goal_id,
        "scheduled_start": task.scheduled_start,
        "scheduled_end": task.scheduled_end,
        "focus_block_id": task.focus_block_id,
    }


class DailyBriefService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def generate_daily_brief(self, user_id: str, target_date: date | None = None) -> DailyBriefOut:
        target = target_date or self._local_today(user_id)
        user = self._get_user(user_id)
        context = self._build_context(user_id, target)
        brief = self._deterministic_brief(user, target, context)
        brief = self._ai_enrich_brief(brief, context)
        self._persist_brief(user_id, target, brief, context)
        return DailyBriefOut(**brief)

    def get_daily_brief(self, user_id: str, target_date: date) -> DailyBriefOut | None:
        history = self.db.execute(
            select(DailyHistory).where(
                DailyHistory.user_id == user_id,
                DailyHistory.history_date == target_date,
            )
        ).scalar_one_or_none()
        if history and isinstance(history.daily_brief, dict):
            return DailyBriefOut(**history.daily_brief)

        snapshot = self.db.execute(
            select(DailyMemorySnapshot).where(
                DailyMemorySnapshot.user_id == user_id,
                DailyMemorySnapshot.snapshot_date == target_date,
            )
        ).scalar_one_or_none()
        if snapshot and isinstance(snapshot.daily_brief, dict):
            return DailyBriefOut(**snapshot.daily_brief)
        return None

    def get_or_generate_today(self, user_id: str) -> DailyBriefOut:
        """
        Always rebuilds from current DB state using the deterministic engine.
        No AI call here — AI enrichment only happens on POST /generate.
        This ensures task counts, warnings, and overdue flags are never stale.
        """
        target = self._local_today(user_id)
        user = self._get_user(user_id)
        context = self._build_context(user_id, target)
        brief = self._deterministic_brief(user, target, context)
        self._persist_brief(user_id, target, brief, context)
        return DailyBriefOut(**brief)

    def _local_today(self, user_id: str) -> date:
        awareness = RealTimeAwarenessEngine(self.db).build_context(user_id)
        return date.fromisoformat(awareness["localDate"])

    def _get_user(self, user_id: str) -> User:
        user = self.db.execute(select(User).where(User.id == user_id)).scalar_one_or_none()
        if not user:
            raise ValueError("User not found.")
        return user

    def _build_context(self, user_id: str, target: date) -> dict[str, Any]:
        context = PriorityEngine(self.db).build_priority_context(user_id, target)
        history = context.get("history") or self._history_context(user_id, target)
        semantic = self._semantic_context(user_id, target)
        if semantic:
            data_sources = list(context.get("data_sources") or [])
            if "semantic_memory" not in data_sources:
                data_sources.append("semantic_memory")
            context["data_sources"] = data_sources

        return {
            "awareness": context.get("awareness") or {},
            "today_events": context.get("today_events", []),
            "upcoming_events": context.get("upcoming_events", []),
            "emails": context.get("important_email") or context.get("emails", []),
            "due_tasks": context.get("due_tasks", []),
            "overdue_tasks": context.get("overdue_tasks", []),
            "goals": context.get("goals", []),
            "history": history,
            "semantic": semantic,
            "today_flow": context.get("today_flow", []),
            "next_best_action": context.get("next_best_action") or {},
            "focus_recommendation": context.get("focus_recommendation") or {},
            "warnings": context.get("warnings", []),
            "data_sources": context.get("data_sources", []),
            "filtered_email_count": context.get("filtered_email_count", 0),
        }

    def _calendar_events(self, user_id: str, target: date) -> list[dict[str, Any]]:
        start, end = _day_bounds(target)
        rows = self.db.execute(
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.start_time <= end,
                CalendarEvent.end_time >= start,
            )
            .order_by(CalendarEvent.start_time)
            .limit(30)
        ).scalars().all()
        return [_event_to_dict(row, category="today") for row in rows]

    def _upcoming_events(self, user_id: str, target: date) -> list[dict[str, Any]]:
        start = datetime.combine(target + timedelta(days=1), time.min, tzinfo=timezone.utc)
        end = start + timedelta(days=7)
        rows = self.db.execute(
            select(CalendarEvent)
            .where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.start_time >= _iso(start),
                CalendarEvent.start_time <= _iso(end),
            )
            .order_by(CalendarEvent.start_time)
            .limit(10)
        ).scalars().all()
        return [_event_to_dict(row, category="upcoming") for row in rows]

    def _important_email(self, user_id: str) -> list[dict[str, Any]]:
        rows = self.db.execute(
            select(EmailMessage)
            .where(
                EmailMessage.user_id == user_id,
                EmailMessage.source == "gmail",
                EmailMessage.status.in_(["unread", "read"]),
            )
            .order_by(EmailMessage.received_at.desc())
            .limit(40)
        ).scalars().all()
        ranked = sorted(
            rows,
            key=lambda msg: (
                msg.status != "unread",
                msg.importance not in {"urgent", "high"},
                msg.received_at,
            ),
        )
        selected = [
            msg for msg in ranked
            if msg.status == "unread" or msg.importance in {"urgent", "high"} or "IMPORTANT" in (msg.labels or [])
        ][:10]
        return [_email_to_dict(row) for row in selected]

    def _tasks_due_today(self, user_id: str, target: date) -> list[dict[str, Any]]:
        target_iso = target.isoformat()
        rows = self.db.execute(
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.status.not_in(DONE_TASK_STATUSES),
            )
            .order_by(Task.priority.desc(), Task.updated_at.desc())
            .limit(200)
        ).scalars().all()
        return [
            _task_to_dict(row, category="due_today")
            for row in rows
            if _date_part(row.due_date) == target_iso
        ]

    def _overdue_tasks(self, user_id: str, target: date) -> list[dict[str, Any]]:
        target_iso = target.isoformat()
        rows = self.db.execute(
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.status.not_in(DONE_TASK_STATUSES),
                Task.due_date.is_not(None),
            )
            .order_by(Task.due_date)
            .limit(200)
        ).scalars().all()
        return [
            _task_to_dict(row, category="overdue")
            for row in rows
            if (_date_part(row.due_date) or "9999-99-99") < target_iso
        ][:25]

    def _active_goals(self, user_id: str) -> list[dict[str, Any]]:
        svc = TaskGoalCalendarService(self.db)
        rows = self.db.execute(
            select(Goal)
            .where(
                Goal.user_id == user_id,
                Goal.status.in_(ACTIVE_GOAL_STATUSES),
            )
            .order_by(Goal.updated_at.desc())
            .limit(20)
        ).scalars().all()
        goals: list[dict[str, Any]] = []
        for goal in rows:
            progress: dict[str, Any] = {}
            try:
                progress = svc.calculate_goal_progress_from_tasks(user_id, goal.id)
            except Exception:
                progress = {
                    "effective_progress": goal.manual_progress or 0.0,
                    "total_tasks": 0,
                    "completed_tasks": 0,
                    "in_progress_tasks": 0,
                }
            goals.append({
                "id": goal.id,
                "title": goal.title,
                "description": _safe_text(goal.description, 180),
                "status": goal.status,
                "priority": goal.priority,
                "target_date": goal.target_date,
                "progress": progress.get("effective_progress", 0.0),
                "linked_tasks": progress.get("total_tasks", 0),
                "completed_tasks": progress.get("completed_tasks", 0),
                "in_progress_tasks": progress.get("in_progress_tasks", 0),
            })
        return goals

    def _history_context(self, user_id: str, target: date) -> dict[str, Any]:
        history = self.db.execute(
            select(DailyHistory).where(
                DailyHistory.user_id == user_id,
                DailyHistory.history_date == target,
            )
        ).scalar_one_or_none()
        snapshot = self.db.execute(
            select(DailyMemorySnapshot).where(
                DailyMemorySnapshot.user_id == user_id,
                DailyMemorySnapshot.snapshot_date == target,
            )
        ).scalar_one_or_none()
        result: dict[str, Any] = {}
        if history:
            result["daily_history"] = {
                "summary": history.summary,
                "notes": _safe_text(history.notes, 300),
                "brief_available": bool(history.daily_brief),
                "completed_task_count": len(history.completed_tasks or []),
                "planned_task_count": len(history.planned_tasks or []),
                "focus_block_count": len(history.focus_blocks or []),
            }
        if snapshot:
            result["daily_snapshot"] = {
                "generated_at": snapshot.generated_at.isoformat(),
                "completed_task_count": len(snapshot.tasks_completed or []),
                "planned_task_count": len(snapshot.tasks_planned or []),
                "active_goal_count": len(snapshot.active_goals or []),
                "calendar_event_count": len(snapshot.calendar_events or []),
            }
        return result

    def _semantic_context(self, user_id: str, target: date) -> list[dict[str, Any]]:
        try:
            result = SemanticMemoryService(self.db).search(
                user_id=user_id,
                query=f"Daily brief priorities for {target.isoformat()} tasks goals calendar email",
                limit=5,
                context_type="general",
            )
            return list(result.get("results") or [])
        except Exception:
            logger.warning("daily_brief.semantic_search_failed user_id=%s", user_id, exc_info=True)
            return []

    def _relationship_context(self, user_id: str, target: date) -> dict[str, Any]:
        svc = TaskGoalCalendarService(self.db)
        next_best: dict[str, Any] = {}
        focus: dict[str, Any] = {}
        try:
            next_best = svc.get_next_best_action(user_id)
        except Exception:
            logger.warning("daily_brief.next_best_action_failed user_id=%s", user_id, exc_info=True)
        try:
            windows = svc.find_available_time_windows(user_id, target)
            if windows:
                best = max(windows, key=lambda item: item.get("duration_minutes", 0))
                focus = {
                    "start_time": best.get("start_time"),
                    "end_time": best.get("end_time"),
                    "duration_minutes": best.get("duration_minutes"),
                    "suggested_use": best.get("suggested_use"),
                    "confidence": best.get("confidence"),
                    "recommended_action": next_best.get("title") if next_best else None,
                }
            elif next_best:
                focus = {
                    "duration_minutes": next_best.get("estimated_duration_minutes"),
                    "suggested_use": "Start with the next best action.",
                    "recommended_action": next_best.get("title"),
                    "confidence": next_best.get("confidence"),
                }
        except Exception:
            logger.warning("daily_brief.available_windows_failed user_id=%s", user_id, exc_info=True)
        return {"next_best_action": next_best, "focus_recommendation": focus}

    def _warnings(
        self,
        events: list[dict[str, Any]],
        overdue_tasks: list[dict[str, Any]],
        emails: list[dict[str, Any]],
    ) -> list[str]:
        warnings: list[str] = []
        if overdue_tasks:
            warnings.append(f"{len(overdue_tasks)} overdue task{'s' if len(overdue_tasks) != 1 else ''} need attention.")
        unread = [item for item in emails if item.get("status") == "unread"]
        if unread:
            warnings.append(f"{len(unread)} important unread Gmail item{'s' if len(unread) != 1 else ''} may need review.")
        overlaps = self._overlap_warnings(events)
        warnings.extend(overlaps)
        return warnings[:8]

    def _overlap_warnings(self, events: list[dict[str, Any]]) -> list[str]:
        parsed: list[tuple[datetime, datetime, str]] = []
        for event in events:
            start = _parse_datetime(event.get("start_time"))
            end = _parse_datetime(event.get("end_time"))
            if start and end:
                parsed.append((start, end, str(event.get("title") or "Event")))
        parsed.sort(key=lambda item: item[0])
        warnings: list[str] = []
        for idx in range(1, len(parsed)):
            prev_start, prev_end, prev_title = parsed[idx - 1]
            start, _end, title = parsed[idx]
            if start < prev_end:
                warnings.append(f"Calendar conflict: {prev_title} overlaps with {title}.")
        return warnings[:3]

    def _deterministic_brief(self, user: User, target: date, context: dict[str, Any]) -> dict[str, Any]:
        event_count = len(context["today_events"])
        upcoming_count = len(context["upcoming_events"])
        email_count = len(context["emails"])
        due_count = len(context["due_tasks"])
        overdue_count = len(context["overdue_tasks"])
        goal_count = len(context["goals"])
        next_best = context["next_best_action"]
        focus = context["focus_recommendation"]
        awareness = context.get("awareness") or {}
        compact = self._compact_text(event_count, email_count, due_count, overdue_count, next_best)
        insights = self._insights(context, upcoming_count)
        summary = self._summary_text(event_count, email_count, due_count, overdue_count, goal_count, next_best)
        now = _utc_now().isoformat()
        return {
            "date": target.isoformat(),
            "title": "Daily Brief",
            "greeting": f"{self._greeting(awareness)}, {user.name}.",
            "summary": summary,
            "compact_text": compact,
            "calendar": [*context["today_events"], *context["upcoming_events"][:5]],
            "email": context["emails"],
            "tasks": [*context["overdue_tasks"], *context["due_tasks"]],
            "goals": context["goals"],
            "next_best_action": next_best,
            "focus_recommendation": focus,
            "warnings": context["warnings"],
            "insights": insights,
            "generated_at": now,
            "data_sources": context["data_sources"],
            "ai_used": False,
            "ai_error": None,
        }

    def _greeting(self, awareness: dict[str, Any]) -> str:
        period = str(awareness.get("dayPeriod") or "morning")
        if period == "afternoon":
            return "Good afternoon"
        if period in {"evening", "night"}:
            return "Good evening"
        return "Good morning"

    def _summary_text(
        self,
        events: int,
        emails: int,
        due: int,
        overdue: int,
        goals: int,
        next_best: dict[str, Any],
    ) -> str:
        recommendation = (
            f" Start with {next_best.get('title')}."
            if next_best.get("title") and next_best.get("type") != "none"
            else ""
        )

        # Fully empty state — nothing at all
        if not any([events, emails, due, overdue, goals]):
            return "Your schedule is open today. No meetings, overdue work, or urgent email require immediate attention."

        # Open calendar + no urgent work but goals exist
        if not events and not emails and not due and not overdue and goals:
            goal_phrase = f"{goals} active {'goal' if goals == 1 else 'goals'}"
            return f"Your schedule is open today. Focus on your {goal_phrase}.{recommendation}"

        # Build a concise executive briefing from whatever is non-zero.
        sentences: list[str] = []

        if recommendation:
            sentences.append(recommendation.strip())

        # Calendar
        if events == 0:
            sentences.append("No meetings today.")
        elif events == 1:
            sentences.append("You have 1 calendar commitment today.")
        else:
            sentences.append(f"You have {events} calendar commitments today.")

        # Tasks
        if due > 0 and overdue > 0:
            sentences.append(
                f"{due} {'task is' if due == 1 else 'tasks are'} due today and "
                f"{overdue} {'is' if overdue == 1 else 'are'} overdue."
            )
        elif due > 0:
            sentences.append(
                f"{due} {'task is' if due == 1 else 'tasks are'} due today."
            )
        elif overdue > 0:
            sentences.append(
                f"{overdue} overdue {'task needs' if overdue == 1 else 'tasks need'} attention."
            )

        # Email
        if emails > 0:
            sentences.append(
                f"{emails} high-value {'email requires' if emails == 1 else 'emails require'} review."
            )

        # Goals — only mention when there are active goals
        if goals > 0:
            sentences.append(
                f"You have {goals} active {'goal' if goals == 1 else 'goals'} in progress."
            )

        return " ".join(sentences)

    def _compact_text(
        self,
        events: int,
        emails: int,
        due: int,
        overdue: int,
        next_best: dict[str, Any],
    ) -> str:
        action = next_best.get("title") if next_best.get("type") != "none" else None

        # Fully empty state
        if not any([events, emails, due, overdue]):
            if action:
                return f"Executive brief: start with {action}. Your schedule is otherwise clear."
            return "Your schedule is open today. No urgent items require attention."

        # Build compact parts — skip zeros silently
        parts: list[str] = []
        if events > 0:
            parts.append(f"{events} {'event' if events == 1 else 'events'}")
        if emails > 0:
            parts.append(f"{emails} {'email' if emails == 1 else 'emails'}")
        if due > 0:
            parts.append(f"{due} due today")
        if overdue > 0:
            parts.append(f"{overdue} overdue")

        body = ", ".join(parts) if parts else "nothing urgent"
        if action:
            return f"Executive brief: start with {action}. Also on deck: {body}."
        return f"Executive brief: {body}."

    def _insights(self, context: dict[str, Any], upcoming_count: int) -> list[str]:
        insights: list[str] = []
        awareness = context.get("awareness") or {}
        if awareness.get("dayOfWeek") and awareness.get("localTime"):
            insights.append(
                f"Current context: {awareness['dayOfWeek']} {awareness.get('localDate')} at {awareness['localTime']} {awareness.get('timezone', 'UTC')}."
            )
        weather = awareness.get("weather") or {}
        if weather.get("condition"):
            temperature = weather.get("temperature")
            temp_text = f", {temperature}F" if temperature is not None else ""
            insights.append(
                f"Weather: {weather.get('condition')}{temp_text}, precipitation chance {weather.get('precipitationChance', 'unknown')}%."
            )
        calendar = awareness.get("calendar") or {}
        if calendar.get("busy"):
            current = calendar.get("currentEvent") or {}
            insights.append(f"You are currently scheduled for {current.get('title', 'an event')}.")
        elif calendar.get("availableMinutes") is not None:
            insights.append(f"Available time before the next event: {calendar.get('availableMinutes')} minutes.")
        focus = context.get("focus_recommendation") or {}
        if focus.get("duration_minutes"):
            insights.append(f"Longest available focus window: {focus['duration_minutes']} minutes.")
        if upcoming_count:
            insights.append(f"{upcoming_count} upcoming event{'s' if upcoming_count != 1 else ''} are on the horizon.")
        semantic = context.get("semantic") or []
        if semantic:
            insights.append(f"Semantic memory surfaced {len(semantic)} relevant context item{'s' if len(semantic) != 1 else ''}.")
        history = context.get("history") or {}
        if history.get("daily_history", {}).get("summary"):
            insights.append(f"Day history note: {history['daily_history']['summary']}")
        return insights[:8]

    def _ai_enrich_brief(self, brief: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        prompt = self._ai_prompt(brief, context)
        try:
            response = get_ai_provider().generate_json(
                prompt,
                system=(
                    "You are HELIOS, a concise personal AI assistant. "
                    "Return JSON only. Use the provided structured context. "
                    "Do not invent calendar events, emails, tasks, or goals. "
                    "Do not include raw email bodies; use snippets only."
                ),
                max_tokens=1200,
            )
            content = response.content if isinstance(response.content, dict) else {}
            if not isinstance(content, dict):
                raise ValueError("AI response content was not a JSON object.")
            enriched = dict(brief)
            for key in ("greeting", "summary", "compact_text"):
                value = content.get(key)
                if isinstance(value, str) and value.strip():
                    enriched[key] = _safe_text(value, 900) or enriched[key]
            for key in ("warnings", "insights"):
                value = content.get(key)
                if isinstance(value, list):
                    cleaned = [_safe_text(str(item), 260) for item in value[:8]]
                    enriched[key] = [item for item in cleaned if item]
            enriched["ai_used"] = True
            enriched["ai_error"] = None
            return enriched
        except Exception as exc:
            logger.warning("daily_brief.ai_enrichment_failed error_type=%s", type(exc).__name__)
            fallback = dict(brief)
            fallback["ai_used"] = False
            fallback["ai_error"] = "AI enrichment unavailable; deterministic brief returned."
            return fallback

    def _ai_prompt(self, brief: dict[str, Any], context: dict[str, Any]) -> str:
        safe_context = {
            "date": brief["date"],
            "deterministic_brief": {
                "summary": brief["summary"],
                "compact_text": brief["compact_text"],
                "warnings": brief["warnings"],
                "insights": brief["insights"],
            },
            "counts": {
                "calendar_today": len(context["today_events"]),
                "calendar_upcoming": len(context["upcoming_events"]),
                "important_email": len(context["emails"]),
                "tasks_due_today": len(context["due_tasks"]),
                "overdue_tasks": len(context["overdue_tasks"]),
                "active_goals": len(context["goals"]),
            },
            "real_time_awareness": context.get("awareness") or {},
            "calendar": brief["calendar"][:8],
            "email": brief["email"][:8],
            "tasks": brief["tasks"][:12],
            "goals": brief["goals"][:8],
            "next_best_action": brief["next_best_action"],
            "focus_recommendation": brief["focus_recommendation"],
            "semantic_context": context.get("semantic", [])[:5],
        }
        return (
            "Improve this Daily Brief using only the structured context below. "
            "Return JSON with optional keys: greeting, summary, compact_text, warnings, insights. "
            "Keep the brief specific, calm, and human-readable.\n\n"
            + json.dumps(safe_context, default=str)
        )

    def _persist_brief(
        self,
        user_id: str,
        target: date,
        brief: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        now = _utc_now()
        awareness = context.get("awareness") or {}
        local_today = date.fromisoformat(awareness.get("localDate") or _today().isoformat())
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
                timezone=awareness.get("timezone") or "UTC",
                day_type="today" if target == local_today else ("future" if target > local_today else "past"),
                status="planned" if target > local_today else "open",
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
        if history.status != "locked":
            history.summary = brief["summary"]
            history.daily_brief = brief
            history.planned_tasks = context["due_tasks"]
            history.overdue_tasks = context["overdue_tasks"]
            history.goals_snapshot = context["goals"]
            history.calendar_events = context["today_events"]
            metadata = dict(history.metadata_json or {})
            metadata["daily_brief_generated_at"] = brief["generated_at"]
            metadata["daily_brief_sources"] = brief.get("data_sources", [])
            metadata["real_time_awareness"] = {
                "localTime": awareness.get("localTime"),
                "localDate": awareness.get("localDate"),
                "timezone": awareness.get("timezone"),
                "dayPeriod": awareness.get("dayPeriod"),
                "weather": awareness.get("weather"),
            }
            history.metadata_json = metadata
            history.updated_at = now

        snapshot = self.db.execute(
            select(DailyMemorySnapshot).where(
                DailyMemorySnapshot.user_id == user_id,
                DailyMemorySnapshot.snapshot_date == target,
            )
        ).scalar_one_or_none()
        if snapshot:
            snapshot.daily_brief = brief
            snapshot.updated_at = now
        self.db.commit()
