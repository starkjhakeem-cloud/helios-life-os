from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.daily_history import DailyHistory
from app.models.email import EmailMessage
from app.models.focus_block import FocusBlock
from app.models.goal import Goal
from app.models.integration import UserIntegration
from app.models.memory import AIMemory
from app.models.task import Task
from app.models.user_preferences import UserPreferences
from app.models.user_profile import UserProfile
from app.services.awareness_engine import RealTimeAwarenessEngine

ACTIVE_GOAL_STATUSES = {"active", "in_progress", "in-progress", "Active", "In Progress"}
OPEN_TASK_STATUSES = {"todo", "in_progress", "in-progress"}
DONE_TASK_STATUSES = {"done", "completed"}

BUSINESS_START_HOUR = 8
BUSINESS_END_HOUR = 22
MIN_WINDOW_MINUTES = 15

TASK_PRIORITY_SCORE = {"critical": 65, "high": 45, "medium": 25, "low": 10}
GOAL_PRIORITY_SCORE = {"critical": 35, "high": 25, "medium": 12, "low": 5}
RECOMMENDATION_TYPES = {
    "goal", "task", "calendar", "email", "planning", "recovery", "assistant", "none",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _fmt_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _date_part(value: str | None) -> str | None:
    parsed = _parse_dt(value)
    if parsed:
        return parsed.date().isoformat()
    return str(value)[:10] if value else None


def _day_bounds(target: date) -> tuple[str, str]:
    start = datetime.combine(target, time.min, tzinfo=timezone.utc)
    end = datetime.combine(target, time.max, tzinfo=timezone.utc)
    return start.isoformat(), end.isoformat()


def _safe_text(value: Any, limit: int = 240) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    return text[:limit] if len(text) <= limit else text[: limit - 1] + "..."


def _domain_from_sender(sender: str | None) -> str:
    if not sender:
        return ""
    match = re.search(r"@([^>\s]+)", sender.lower())
    if match:
        return match.group(1).strip().strip(">")
    parts = sender.lower().split()
    return parts[-1].strip("<>") if parts else ""


def _contains_any(text: str, patterns: Iterable[str]) -> list[str]:
    return [pattern for pattern in patterns if pattern in text]


def _confidence(score: float, max_score: float = 160.0) -> float:
    return round(max(0.0, min(score / max_score, 1.0)), 2)


def _event_to_dict(event: CalendarEvent, *, category: str) -> dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "description": _safe_text(event.description, 300),
        "start_time": event.start_time,
        "end_time": event.end_time,
        "location": event.location,
        "source": event.source,
        "event_type": event.event_type or "event",
        "category": category,
        "linked_goal_id": event.linked_goal_id,
        "linked_task_id": event.linked_task_id,
    }


def _task_to_dict(task: Task, *, category: str | None = None) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "description": _safe_text(task.description, 300),
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date,
        "estimated_duration_minutes": task.estimated_duration_minutes,
        "category": task.category or category,
        "linked_goal_id": task.linked_goal_id,
        "scheduled_start": task.scheduled_start,
        "scheduled_end": task.scheduled_end,
        "focus_block_id": task.focus_block_id,
        "source": task.source,
        "source_id": task.source_id,
    }


def _goal_to_dict(goal: Goal, progress: dict[str, Any] | None = None) -> dict[str, Any]:
    progress = progress or {}
    return {
        "id": goal.id,
        "title": goal.title,
        "description": _safe_text(goal.description, 300),
        "status": goal.status,
        "priority": goal.priority or "medium",
        "target_date": goal.target_date,
        "progress": progress.get("effective_progress", goal.manual_progress or 0.0),
        "linked_tasks": progress.get("total_tasks", 0),
        "completed_tasks": progress.get("completed_tasks", 0),
        "in_progress_tasks": progress.get("in_progress_tasks", 0),
    }


def _email_to_dict(message: EmailMessage, classification: dict[str, Any]) -> dict[str, Any]:
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
        "classification": classification,
    }


class EmailPriorityClassifier:
    """
    Provider-agnostic email scoring.

    The classifier intentionally uses message content, sender/domain, metadata,
    and priority labels as signals. Gmail labels can help, but they are never the
    only reason a message is allowed into HELIOS recommendations.
    """

    HIGH_KEYWORDS = (
        "action required", "urgent", "important", "security alert", "password",
        "passcode", "verification code", "two-factor", "2fa", "sign-in",
        "login", "suspicious", "fraud", "account locked", "confirm",
        "approval", "approve", "calendar invitation", "invitation:",
        "accepted:", "declined:", "updated invitation", "meeting invitation",
        "appointment", "wgu", "course", "enrollment", "github", "pull request",
        "review requested", "apple developer", "developer program", "irs",
        "government", "healthcare", "doctor", "clinic", "insurance claim",
        "bank", "statement", "payment failed", "past due", "overdue",
    )
    CRITICAL_KEYWORDS = (
        "security alert", "password", "passcode", "verification code", "2fa",
        "two-factor", "suspicious", "fraud", "account locked", "payment failed",
        "past due", "overdue", "calendar invitation", "meeting invitation",
        "review requested", "action required",
    )
    MEDIUM_KEYWORDS = (
        "shipping", "shipped", "delivered", "delivery", "tracking",
        "subscription", "renewal", "receipt", "invoice", "utility",
        "bill", "payment reminder", "statement available", "due soon",
    )
    LOW_KEYWORDS = (
        "unsubscribe", "coupon", "sale", "discount", "% off", "deal",
        "newsletter", "digest", "promotion", "promotional", "marketing",
        "advertisement", "sponsored", "new arrivals", "clearance", "cart",
        "shopping", "black friday", "cyber monday", "social notification",
        "liked your", "followed you", "recommended for you", "trending",
        "limited time offer",
    )
    HIGH_DOMAIN_SUFFIXES = (
        ".gov", ".mil", "wgu.edu", "my.wgu.edu", "github.com", "apple.com",
        "developer.apple.com", "chase.com", "bankofamerica.com",
        "wellsfargo.com", "capitalone.com", "americanexpress.com",
        "discover.com", "paypal.com", "stripe.com", "healthcare.gov",
        "mychart.com", "epic.com",
    )
    LOW_LABELS = {
        "category_promotions", "promotions", "promotion", "marketing",
        "newsletter", "social", "category_social", "spam",
    }
    HIGH_LABELS = {"important", "starred", "category_primary", "personal", "family"}

    def classify(self, message: EmailMessage) -> dict[str, Any]:
        labels = {str(label).lower() for label in (message.labels or [])}
        metadata = message.raw_metadata or {}
        domain = _domain_from_sender(message.sender)
        text = " ".join(
            str(part or "")
            for part in (message.sender, message.subject, message.snippet, domain)
        ).lower()

        high_hits = _contains_any(text, self.HIGH_KEYWORDS)
        critical_hits = _contains_any(text, self.CRITICAL_KEYWORDS)
        medium_hits = _contains_any(text, self.MEDIUM_KEYWORDS)
        low_hits = _contains_any(text, self.LOW_KEYWORDS)

        score = 25
        reasons: list[str] = []
        category = "general"

        if message.importance == "urgent":
            score += 28
            reasons.append("provider marked urgent")
        elif message.importance == "high":
            score += 18
            reasons.append("provider marked high")

        if message.status == "unread":
            score += 5

        if labels & self.HIGH_LABELS:
            score += 12
            reasons.append("priority/contact label")

        if metadata.get("contact_priority") in {"family", "important", "vip"}:
            score += 45
            category = "important_contact"
            reasons.append("important contact")

        if any(domain.endswith(suffix) for suffix in self.HIGH_DOMAIN_SUFFIXES):
            score += 34
            reasons.append(f"trusted domain {domain}")
            if domain.endswith(".gov"):
                category = "government"
            elif "wgu" in domain:
                category = "school"
            elif "github" in domain:
                category = "github"
            elif "apple" in domain:
                category = "apple_developer"
            elif any(bank in domain for bank in ("bank", "chase", "capital", "paypal", "stripe", "discover", "express")):
                category = "finance"

        if high_hits:
            score += min(50, 18 + len(high_hits) * 8)
            reasons.append("high-value signal: " + ", ".join(high_hits[:3]))
            if category == "general":
                category = self._category_from_text(text)

        if medium_hits:
            score += min(28, 12 + len(medium_hits) * 4)
            reasons.append("time-sensitive notice: " + ", ".join(medium_hits[:3]))
            if category == "general":
                category = "notice"

        promotional_label = bool(labels & self.LOW_LABELS)
        if promotional_label or low_hits:
            if critical_hits or metadata.get("contact_priority") in {"family", "important", "vip"}:
                score -= 12
                reasons.append("promotional signal present but overridden by critical context")
            else:
                score -= 65
                category = "promotion"
                reasons.append("low-value promotional/newsletter signal")

        if "spam" in labels or message.status in {"trashed", "archived"}:
            score -= 80
            category = "spam"
            reasons.append("spam/archived signal")

        score = max(0, min(score, 100))
        if category in {"promotion", "spam"} and not critical_hits:
            priority = "low"
        elif score >= 72:
            priority = "high"
        elif score >= 45:
            priority = "medium"
        else:
            priority = "low"

        actionable = self.looks_actionable(message) or priority == "high"
        return {
            "priority": priority,
            "category": category,
            "score": score,
            "actionable": actionable,
            "recommendation_eligible": priority in {"high", "medium"} and category not in {"promotion", "spam"},
            "core_influence": priority == "high" and category not in {"promotion", "spam"},
            "reasons": reasons[:5],
        }

    def looks_actionable(self, message: EmailMessage) -> bool:
        text = f"{message.subject or ''} {message.snippet or ''}".lower()
        signals = (
            "reply", "respond", "question", "approve", "confirm", "review",
            "action required", "please", "pay", "sign", "complete", "schedule",
            "deadline", "due", "verify", "reset",
        )
        return any(signal in text for signal in signals)

    def _category_from_text(self, text: str) -> str:
        if "calendar invitation" in text or "meeting invitation" in text or "invitation:" in text:
            return "calendar_invite"
        if "wgu" in text or "course" in text or "enrollment" in text:
            return "school"
        if "github" in text or "pull request" in text:
            return "github"
        if "apple developer" in text or "developer program" in text:
            return "apple_developer"
        if "password" in text or "security" in text or "sign-in" in text or "2fa" in text:
            return "security"
        if "doctor" in text or "health" in text or "clinic" in text:
            return "healthcare"
        if "bank" in text or "payment" in text or "statement" in text:
            return "finance"
        return "important"


@dataclass
class PriorityEngineResult:
    context: dict[str, Any]

    @property
    def ranked_actions(self) -> list[dict[str, Any]]:
        return list(self.context.get("ranked_actions") or [])

    @property
    def next_best_action(self) -> dict[str, Any]:
        return dict(self.context.get("next_best_action") or {})


class PriorityEngine:
    """
    Central deterministic intelligence layer for HELIOS V3.

    All product surfaces that need recommendations should call this service
    instead of creating their own ranking rules. The engine deliberately keeps
    provider-specific data at the ingestion edge and emits normalized actions.
    """

    def __init__(self, db: Session, *, now: datetime | None = None) -> None:
        self.db = db
        self.now = (now or _utc_now()).astimezone(timezone.utc)
        self.email_classifier = EmailPriorityClassifier()

    def build_priority_context(self, user_id: str, target_date: date | None = None) -> dict[str, Any]:
        target = target_date or self.now.date()
        awareness = RealTimeAwarenessEngine(self.db, now=self.now).build_context(user_id, target)
        tasks = self._fetch_open_tasks(user_id)
        goals = self._fetch_active_goals(user_id)
        goals_by_id = {goal.id: goal for goal in goals}
        goal_progress = {goal.id: self._calculate_goal_progress(user_id, goal.id) for goal in goals}
        today_events = self._fetch_events_for_day(user_id, target)
        upcoming_events = self._fetch_upcoming_events(user_id, target)
        focus_block = self._fetch_active_focus_block(user_id)
        available_windows = [dict(window) for window in awareness.get("calendar", {}).get("freeWindows", [])]
        classified_emails, filtered_email_count = self._fetch_classified_email(user_id)
        histories = self._fetch_history(user_id)
        memories = self._fetch_memories(user_id)
        connected_services = self._fetch_connected_services(user_id)
        profile = awareness.get("profile") or self._fetch_profile(user_id)

        due_tasks = [
            _task_to_dict(task, category="due_today")
            for task in tasks
            if _date_part(task.due_date) == target.isoformat()
        ]
        overdue_tasks = [
            _task_to_dict(task, category="overdue")
            for task in tasks
            if task.due_date and (_date_part(task.due_date) or "9999-99-99") < target.isoformat()
        ]
        goals_out = [_goal_to_dict(goal, goal_progress.get(goal.id)) for goal in goals]
        important_email = [
            _email_to_dict(message, classification)
            for message, classification in classified_emails
            if classification["recommendation_eligible"]
        ][:12]

        base_context: dict[str, Any] = {
            "target_date": target.isoformat(),
            "generated_at": self.now.isoformat(),
            "awareness": awareness,
            "profile": profile,
            "tasks_raw": tasks,
            "goals_raw": goals,
            "goals_by_id": goals_by_id,
            "goal_progress": goal_progress,
            "today_events_raw": today_events,
            "upcoming_events_raw": upcoming_events,
            "active_focus_block": self._focus_block_to_dict(focus_block) if focus_block else None,
            "available_windows": available_windows,
            "classified_emails_raw": classified_emails,
            "filtered_email_count": filtered_email_count,
            "history": histories,
            "memories": memories,
            "connected_services": connected_services,
            "today_events": [_event_to_dict(event, category="today") for event in today_events],
            "upcoming_events": [_event_to_dict(event, category="upcoming") for event in upcoming_events],
            "emails": important_email,
            "important_email": important_email,
            "due_tasks": due_tasks,
            "overdue_tasks": overdue_tasks,
            "goals": goals_out,
        }
        ranked_actions = self._rank_actions(base_context)
        next_best = self._next_best_from_actions(ranked_actions, goals)
        base_context["ranked_actions"] = ranked_actions
        base_context["recommendations"] = ranked_actions
        base_context["today_flow"] = ranked_actions[:6]
        base_context["next_best_action"] = next_best
        base_context["focus_recommendation"] = self._focus_recommendation(available_windows, next_best)
        base_context["warnings"] = self._warnings(base_context)
        base_context["data_sources"] = self._data_sources(base_context)
        return base_context

    def get_next_best_action(self, user_id: str, target_date: date | None = None) -> dict[str, Any]:
        return self.build_priority_context(user_id, target_date).get("next_best_action") or self._empty_action()

    def build_task_suggestion_drafts(
        self,
        user_id: str,
        *,
        sources: set[str] | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        selected = sources or {
            "email", "gmail", "calendar", "goals", "daily_brief",
            "assistant_context", "next_best_action",
        }
        context = self.build_priority_context(user_id)
        drafts: list[dict[str, Any]] = []

        for action in context["ranked_actions"]:
            source_type = str(action.get("source_type") or action.get("type") or "assistant")
            provider_source = str(action.get("provider") or source_type)
            include_email = source_type == "email" and (
                "email" in selected or provider_source in selected or ("gmail" in selected and provider_source == "gmail")
            )
            include_other = source_type in selected or provider_source in selected
            if not include_email and not include_other:
                continue
            if source_type == "task":
                continue
            drafts.append(self._action_to_suggestion_draft(action))

        if "daily_brief" in selected:
            drafts.extend(self._daily_brief_suggestion_drafts(user_id))

        if "assistant_context" in selected and context["ranked_actions"]:
            top = context["ranked_actions"][0]
            if top.get("source_type") not in {"task", "email", "calendar", "goals"}:
                drafts.append(self._action_to_suggestion_draft(top, source_type="assistant_context"))

        if "next_best_action" in selected:
            next_best = context.get("next_best_action") or {}
            if next_best.get("type") != "none" and not next_best.get("linked_task_id"):
                drafts.append(self._next_best_to_suggestion_draft(next_best))

        return self._dedupe_drafts(drafts)[:limit]

    def build_day_schedule(
        self,
        user_id: str,
        target_date: date | None = None,
        *,
        commit: bool = True,
        max_items: int = 8,
    ) -> dict[str, Any]:
        target = target_date or self.now.date()
        context = self.build_priority_context(user_id, target)
        awareness = context.get("awareness") or {}
        windows = [dict(window) for window in context["available_windows"]]
        original_window_count = len(windows)
        scheduled: list[dict[str, Any]] = []
        unscheduled: list[dict[str, Any]] = []
        warnings = list(context.get("warnings") or [])
        schedule_blocks = self._calendar_plan_blocks(context["today_events_raw"])
        candidates = self._build_day_candidates(context, target)

        relationship_service = None
        if commit:
            from app.services.task_goal_calendar_service import TaskGoalCalendarService
            relationship_service = TaskGoalCalendarService(self.db)

        planned_count = 0
        for action in candidates:
            if planned_count >= max_items:
                unscheduled.append(action)
                continue
            duration = int(action.get("estimated_duration_minutes") or 30)
            duration = max(MIN_WINDOW_MINUTES, min(duration, 120))
            slot = self._claim_window(windows, duration)
            if not slot:
                unscheduled.append(action)
                continue
            calendar_event = None
            if relationship_service and action.get("type") == "task" and action.get("linked_task_id"):
                try:
                    result = relationship_service.schedule_task(
                        user_id,
                        str(action["linked_task_id"]),
                        slot["start_time"],
                        slot["end_time"],
                    )
                    calendar_event = result["calendar_event"]
                except Exception:
                    unscheduled.append(action)
                    warnings.append(f"Could not commit calendar block for {action['title']}.")
                    continue
            block = self._plan_block_from_action(action, slot)
            schedule_blocks.append(block)
            planned_count += 1
            if action.get("type") == "task":
                scheduled.append({
                    "type": "task",
                    "title": action["title"],
                    "reason": action["reason"],
                    "linked_task_id": action.get("linked_task_id"),
                    "linked_goal_id": action.get("linked_goal_id"),
                    "start_time": slot["start_time"],
                    "end_time": slot["end_time"],
                    "duration_minutes": duration,
                    "score": action.get("score"),
                    "confidence": action.get("confidence"),
                    "calendar_event": calendar_event,
                })

        if not scheduled and unscheduled:
            for action in unscheduled[: min(3, max_items)]:
                schedule_blocks.append(
                    self._plan_block_from_action(
                        action,
                        None,
                        fallback_reason="No open calendar window remains, so keep this as a constrained priority.",
                    )
                )

        if not candidates and not context["today_events_raw"]:
            schedule_blocks.extend(self._starter_plan_blocks(windows, target))
            warnings.append("No tasks, goals, calendar events, or high-value email were found for this day.")
        elif original_window_count == 0 and unscheduled:
            warnings.append("The day is fully booked or outside planning hours; HELIOS kept priorities untimed instead of failing.")

        weather_warning = self._build_day_weather_warning(awareness, candidates)
        if weather_warning:
            warnings.append(weather_warning)

        self._add_wrap_up_block(schedule_blocks, windows, target)
        schedule_blocks = self._sort_schedule_blocks(schedule_blocks)
        primary_focus = self._primary_focus(context, schedule_blocks)
        top_tasks = self._top_tasks(candidates, context["recommendations"])

        return {
            "date": target.isoformat(),
            "generated_at": self.now.isoformat(),
            "committed": commit,
            "summary": self._build_day_summary(context, schedule_blocks, primary_focus),
            "primaryFocus": primary_focus,
            "scheduleBlocks": schedule_blocks,
            "topTasks": top_tasks,
            "warnings": self._unique_warnings(warnings),
            "awareness": self._compact_awareness(awareness),
            "scheduled_items": scheduled,
            "unscheduled_actions": unscheduled[:8],
            "windows_remaining": windows,
            "next_best_action": context["next_best_action"],
            "recommendations": context["recommendations"][:max_items],
            "filtered_email_count": context["filtered_email_count"],
        }

    def _calendar_plan_blocks(self, events: list[CalendarEvent]) -> list[dict[str, Any]]:
        blocks: list[dict[str, Any]] = []
        for event in events:
            blocks.append({
                "id": f"calendar-{event.id}",
                "title": event.title,
                "startTime": event.start_time,
                "endTime": event.end_time,
                "type": "calendar",
                "sourceId": event.id,
                "reason": "Fixed calendar commitment already blocking this time.",
                "priority": "high" if event.event_type != "task_block" else "medium",
            })
        return blocks

    def _build_day_candidates(self, context: dict[str, Any], target: date) -> list[dict[str, Any]]:
        allowed = {"task", "email", "recovery", "planning"}
        candidates = [
            action for action in (context.get("ranked_actions") or [])
            if action.get("type") in allowed and not action.get("scheduled_start")
        ]
        return sorted(
            candidates,
            key=lambda action: self._build_day_priority_key(action, target),
        )

    def _build_day_priority_key(self, action: dict[str, Any], target: date) -> tuple[int, float]:
        action_type = str(action.get("type") or "")
        priority = str(action.get("priority") or "").lower()
        due = _date_part(action.get("due_date"))
        target_iso = target.isoformat()

        if action_type == "task" and due and due < target_iso:
            bucket = 0
        elif action_type == "task" and due == target_iso:
            bucket = 1
        elif action_type == "recovery" and priority in {"critical", "high"}:
            bucket = 2
        elif action_type == "task" and (action.get("linked_goal_id") or priority in {"critical", "high"}):
            bucket = 3
        elif action_type == "email":
            bucket = 4
        elif action_type in {"recovery", "planning"}:
            bucket = 5
        else:
            bucket = 6
        return (bucket, -float(action.get("score") or 0))

    def _plan_block_from_action(
        self,
        action: dict[str, Any],
        slot: dict[str, Any] | None,
        *,
        fallback_reason: str | None = None,
    ) -> dict[str, Any]:
        source_ids = action.get("sourceIds") or {}
        block: dict[str, Any] = {
            "id": f"build-day-{action.get('id') or uuid.uuid4()}",
            "title": action.get("title") or "Priority block",
            "type": self._plan_block_type(action),
            "sourceId": (
                source_ids.get("taskId")
                or source_ids.get("goalId")
                or source_ids.get("emailId")
                or source_ids.get("eventId")
                or action.get("source_id")
            ),
            "reason": fallback_reason or action.get("reason") or "Highest-value priority from HELIOS.",
            "priority": self._block_priority(action),
        }
        if slot:
            block["startTime"] = slot["start_time"]
            block["endTime"] = slot["end_time"]
        return block

    def _plan_block_type(self, action: dict[str, Any]) -> str:
        action_type = str(action.get("type") or "planning")
        if action_type == "recovery":
            return "planning"
        if action_type in {"task", "email", "calendar", "planning", "goal"}:
            return action_type
        return "planning"

    def _block_priority(self, action: dict[str, Any]) -> str:
        urgency = str(action.get("urgency") or action.get("priority") or "medium").lower()
        return urgency if urgency in {"low", "medium", "high", "critical"} else "medium"

    def _starter_plan_blocks(self, windows: list[dict[str, Any]], target: date) -> list[dict[str, Any]]:
        blocks: list[dict[str, Any]] = []
        starter_items = [
            ("Choose today's primary focus", 30, "planning", "Start by selecting one meaningful outcome for the day.", "medium"),
            ("Protect a focus block", 60, "focus", "Use this block for the most important work you identify.", "medium"),
            ("Take a real break", 15, "break", "Keep the day sustainable instead of filling every open minute.", "low"),
        ]
        for title, duration, block_type, reason, priority in starter_items:
            slot = self._claim_window(windows, duration)
            block = {
                "id": f"starter-{target.isoformat()}-{title.lower().replace(' ', '-')}",
                "title": title,
                "type": block_type,
                "reason": reason,
                "priority": priority,
            }
            if slot:
                block["startTime"] = slot["start_time"]
                block["endTime"] = slot["end_time"]
            blocks.append(block)
        return blocks

    def _add_wrap_up_block(
        self,
        blocks: list[dict[str, Any]],
        windows: list[dict[str, Any]],
        target: date,
    ) -> None:
        if any(block.get("title") == "Evening wrap-up" for block in blocks):
            return
        slot = self._claim_window(windows, 15)
        block: dict[str, Any] = {
            "id": f"wrap-up-{target.isoformat()}",
            "title": "Evening wrap-up",
            "type": "planning",
            "reason": "Close open loops, capture wins, and tee up tomorrow.",
            "priority": "low",
        }
        if slot:
            block["startTime"] = slot["start_time"]
            block["endTime"] = slot["end_time"]
        elif not blocks:
            return
        blocks.append(block)

    def _sort_schedule_blocks(self, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        def key(block: dict[str, Any]) -> tuple[int, datetime, str]:
            start = _parse_dt(block.get("startTime"))
            return (
                0 if start else 1,
                start or datetime.max.replace(tzinfo=timezone.utc),
                str(block.get("title") or ""),
            )
        return sorted(blocks, key=key)

    def _primary_focus(self, context: dict[str, Any], blocks: list[dict[str, Any]]) -> str:
        next_best = context.get("next_best_action") or {}
        if next_best.get("type") != "none" and next_best.get("title"):
            return str(next_best["title"])
        for block in blocks:
            if block.get("type") not in {"calendar", "break"}:
                return str(block.get("title") or "Choose today's primary focus")
        return "Choose today's primary focus"

    def _top_tasks(
        self,
        candidates: list[dict[str, Any]],
        recommendations: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for action in [*candidates, *recommendations]:
            if action.get("type") not in {"task", "recovery", "planning"}:
                continue
            source_ids = action.get("sourceIds") or {}
            item = {
                "id": source_ids.get("taskId") or source_ids.get("goalId"),
                "title": action.get("title") or "Priority task",
                "reason": action.get("reason") or "Recommended by the priority engine.",
                "estimatedMinutes": action.get("effortMinutes") or action.get("estimated_duration_minutes"),
            }
            if item not in items:
                items.append(item)
            if len(items) >= 5:
                break
        return items

    def _build_day_weather_warning(
        self,
        awareness: dict[str, Any],
        candidates: list[dict[str, Any]],
    ) -> str | None:
        weather = awareness.get("weather") or {}
        if int(weather.get("precipitationChance") or 0) < 60:
            return None
        outdoor_terms = ("outdoor", "outside", "run", "walk", "workout", "gym", "hike", "yard")
        outdoor = [
            action for action in candidates
            if any(term in f"{action.get('title', '')} {action.get('description', '')}".lower() for term in outdoor_terms)
        ]
        if not outdoor:
            return None
        return (
            f"Weather may affect outdoor work: {weather.get('condition', 'conditions')} "
            f"with {weather.get('precipitationChance')}% precipitation chance."
        )

    def _build_day_summary(
        self,
        context: dict[str, Any],
        blocks: list[dict[str, Any]],
        primary_focus: str,
    ) -> str:
        calendar_count = len([block for block in blocks if block.get("type") == "calendar"])
        priority_count = len([block for block in blocks if block.get("type") not in {"calendar", "break"}])
        if priority_count == 0 and calendar_count == 0:
            return "I created a starter day because HELIOS did not find scheduled commitments or priority work."
        calendar_label = "commitment" if calendar_count == 1 else "commitments"
        block_label = "priority block" if priority_count == 1 else "priority blocks"
        return (
            f"I built this day around {primary_focus}, "
            f"with {calendar_count} calendar {calendar_label} and {priority_count} {block_label}."
        )

    def _unique_warnings(self, warnings: list[str]) -> list[str]:
        unique: list[str] = []
        for warning in warnings:
            if warning and warning not in unique:
                unique.append(warning)
        return unique[:8]

    def compact_priority_package(self, user_id: str, target_date: date | None = None) -> dict[str, Any]:
        context = self.build_priority_context(user_id, target_date)
        return {
            "generated_at": context["generated_at"],
            "target_date": context["target_date"],
            "next_best_action": context["next_best_action"],
            "today_flow": context["today_flow"][:5],
            "recommendations": context["recommendations"][:5],
            "important_email": context["important_email"][:5],
            "available_windows": context["available_windows"][:5],
            "awareness": self._compact_awareness(context.get("awareness") or {}),
            "warnings": context["warnings"],
            "filtered_email_count": context["filtered_email_count"],
        }

    def find_available_time_windows(self, user_id: str, target_date: date) -> list[dict[str, Any]]:
        return RealTimeAwarenessEngine(self.db, now=self.now).find_available_time_windows(user_id, target_date)

    def _fetch_open_tasks(self, user_id: str) -> list[Task]:
        return (
            self.db.execute(
                select(Task)
                .where(Task.user_id == user_id, Task.status.not_in(DONE_TASK_STATUSES))
                .order_by(Task.updated_at.desc())
                .limit(250)
            )
            .scalars()
            .all()
        )

    def _fetch_active_goals(self, user_id: str) -> list[Goal]:
        return (
            self.db.execute(
                select(Goal)
                .where(Goal.user_id == user_id, Goal.status.in_(ACTIVE_GOAL_STATUSES))
                .order_by(Goal.updated_at.desc())
                .limit(60)
            )
            .scalars()
            .all()
        )

    def _fetch_events_for_day(self, user_id: str, target: date) -> list[CalendarEvent]:
        start, end = _day_bounds(target)
        return (
            self.db.execute(
                select(CalendarEvent)
                .where(
                    CalendarEvent.user_id == user_id,
                    CalendarEvent.start_time <= end,
                    CalendarEvent.end_time >= start,
                )
                .order_by(CalendarEvent.start_time)
                .limit(50)
            )
            .scalars()
            .all()
        )

    def _fetch_upcoming_events(self, user_id: str, target: date) -> list[CalendarEvent]:
        start = datetime.combine(target + timedelta(days=1), time.min, tzinfo=timezone.utc)
        end = start + timedelta(days=7)
        return (
            self.db.execute(
                select(CalendarEvent)
                .where(
                    CalendarEvent.user_id == user_id,
                    CalendarEvent.start_time >= start.isoformat(),
                    CalendarEvent.start_time <= end.isoformat(),
                )
                .order_by(CalendarEvent.start_time)
                .limit(20)
            )
            .scalars()
            .all()
        )

    def _fetch_classified_email(self, user_id: str) -> tuple[list[tuple[EmailMessage, dict[str, Any]]], int]:
        rows = (
            self.db.execute(
                select(EmailMessage)
                .where(
                    EmailMessage.user_id == user_id,
                    EmailMessage.status.in_(["unread", "read"]),
                )
                .order_by(EmailMessage.received_at.desc())
                .limit(100)
            )
            .scalars()
            .all()
        )
        classified = [(message, self.email_classifier.classify(message)) for message in rows]
        filtered = [item for item in classified if not item[1]["recommendation_eligible"]]
        important = [item for item in classified if item[1]["recommendation_eligible"]]
        important.sort(key=lambda item: (item[1]["score"], item[0].received_at), reverse=True)
        return important, len(filtered)

    def _fetch_active_focus_block(self, user_id: str) -> FocusBlock | None:
        return self.db.execute(
            select(FocusBlock).where(FocusBlock.user_id == user_id, FocusBlock.status == "in_progress")
        ).scalar_one_or_none()

    def _fetch_history(self, user_id: str) -> dict[str, Any]:
        rows = (
            self.db.execute(
                select(DailyHistory)
                .where(DailyHistory.user_id == user_id)
                .order_by(DailyHistory.history_date.desc())
                .limit(14)
            )
            .scalars()
            .all()
        )
        return {
            "recent_days": [
                {
                    "date": row.history_date.isoformat(),
                    "summary": _safe_text(row.summary, 180),
                    "completed_task_count": len(row.completed_tasks or []),
                    "planned_task_count": len(row.planned_tasks or []),
                }
                for row in rows
            ]
        }

    def _fetch_memories(self, user_id: str) -> list[dict[str, Any]]:
        rows = (
            self.db.execute(
                select(AIMemory)
                .where(AIMemory.user_id == user_id)
                .order_by(AIMemory.created_at.desc())
                .limit(12)
            )
            .scalars()
            .all()
        )
        return [{"type": row.memory_type, "content": _safe_text(row.content, 220)} for row in rows]

    def _fetch_connected_services(self, user_id: str) -> list[dict[str, Any]]:
        rows = (
            self.db.execute(
                select(UserIntegration)
                .where(UserIntegration.user_id == user_id)
                .order_by(UserIntegration.connected_at.desc())
            )
            .scalars()
            .all()
        )
        return [
            {
                "provider": row.provider,
                "service_type": row.service_type,
                "status": row.status,
                "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
            }
            for row in rows
        ]

    def _fetch_profile(self, user_id: str) -> dict[str, Any]:
        profile = self.db.execute(select(UserProfile).where(UserProfile.user_id == user_id)).scalar_one_or_none()
        prefs = self.db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id)).scalar_one_or_none()
        return {
            "timezone": (profile.timezone if profile else None) or "UTC",
            "work_focus": prefs.work_focus if prefs else None,
            "daily_brief_time": prefs.daily_brief_time if prefs else None,
            "assistant_tone": prefs.assistant_tone if prefs else None,
        }

    def _calculate_goal_progress(self, user_id: str, goal_id: str) -> dict[str, Any]:
        goal = self.db.execute(
            select(Goal).where(Goal.id == goal_id, Goal.user_id == user_id)
        ).scalar_one_or_none()
        if not goal:
            return {}
        tasks = (
            self.db.execute(
                select(Task).where(Task.user_id == user_id, Task.linked_goal_id == goal_id)
            )
            .scalars()
            .all()
        )
        total = len(tasks)
        done = sum(1 for task in tasks if task.status in DONE_TASK_STATUSES)
        in_progress = sum(1 for task in tasks if task.status in {"in_progress", "in-progress"})
        computed = round(done / total, 4) if total else 0.0
        return {
            "total_tasks": total,
            "completed_tasks": done,
            "in_progress_tasks": in_progress,
            "computed_progress": computed,
            "manual_progress": goal.manual_progress,
            "effective_progress": goal.manual_progress if goal.manual_progress is not None else computed,
        }

    def _rank_actions(self, context: dict[str, Any]) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        goals_by_id: dict[str, Goal] = context["goals_by_id"]
        active_focus = context.get("active_focus_block") or {}
        active_task_ids = set(active_focus.get("linked_task_ids") or [])

        for task in context["tasks_raw"]:
            actions.append(self._task_action(task, goals_by_id, context["available_windows"], active_task_ids))

        for message, classification in context["classified_emails_raw"]:
            if classification["recommendation_eligible"]:
                actions.append(self._email_action(message, classification, context["available_windows"]))

        for event in [*context["today_events_raw"], *context["upcoming_events_raw"][:5]]:
            action = self._calendar_action(event)
            if action:
                actions.append(action)

        actions.extend(self._calendar_conflict_actions(context["today_events_raw"]))
        actions.extend(self._goal_actions(context["goals_raw"], context["tasks_raw"], context["goal_progress"]))
        awareness_action = self._awareness_action(context)
        if awareness_action:
            actions.append(awareness_action)
        planning = self._planning_action(context["available_windows"], context["tasks_raw"], context["goals_raw"])
        if planning:
            actions.append(planning)

        deduped: dict[tuple[str, str | None, str], dict[str, Any]] = {}
        for action in actions:
            key = (str(action.get("type")), action.get("linked_task_id") or action.get("source_id"), action["title"].lower())
            existing = deduped.get(key)
            if not existing or action.get("score", 0) > existing.get("score", 0):
                deduped[key] = action
        ranked = sorted(deduped.values(), key=lambda action: action.get("score", 0), reverse=True)
        return [self._normalize_recommendation(action) for action in ranked]

    def _awareness_action(self, context: dict[str, Any]) -> dict[str, Any] | None:
        awareness = context.get("awareness") or {}
        day_period = str(awareness.get("dayPeriod") or "")
        tasks = awareness.get("tasks") or {}
        calendar = awareness.get("calendar") or {}
        weather = awareness.get("weather") or {}
        windows = context.get("available_windows") or []

        if day_period in {"evening", "night"} and (tasks.get("remaining") or context.get("goals")):
            return {
                "type": "planning",
                "source_type": "real_time_awareness",
                "source_id": f"{awareness.get('localDate')}-shutdown-plan",
                "title": "Plan tomorrow before you shut down",
                "description": "Use the end of the day to close loops and set tomorrow's first move.",
                "reason": f"It is {day_period}, and planning is now higher leverage than starting deep work.",
                "score": 52 if day_period == "evening" else 46,
                "confidence": 0.76,
                "priority": "medium",
                "due_date": awareness.get("localDate") or self.now.date().isoformat(),
                "estimated_duration_minutes": 20,
                "linked_goal_id": None,
                "linked_task_id": None,
                "suggested_start_time": self._suggest_start_for_duration(windows, 20),
                "metadata": {"awareness": self._compact_awareness(awareness)},
            }

        if day_period == "morning" and (calendar.get("availableMinutes") or 0) >= 60:
            return {
                "type": "planning",
                "source_type": "real_time_awareness",
                "source_id": f"{awareness.get('localDate')}-morning-focus",
                "title": "Protect this morning focus window",
                "description": "Calendar availability and time of day favor high-focus work.",
                "reason": "Morning energy and open calendar time make this a strong focus window.",
                "score": 64,
                "confidence": 0.68,
                "priority": "medium",
                "due_date": awareness.get("localDate") or self.now.date().isoformat(),
                "estimated_duration_minutes": min(int(calendar.get("availableMinutes") or 60), 90),
                "linked_goal_id": None,
                "linked_task_id": None,
                "suggested_start_time": self._suggest_start_for_duration(windows, 45),
                "metadata": {"awareness": self._compact_awareness(awareness)},
            }

        if int(weather.get("precipitationChance") or 0) >= 60:
            return {
                "type": "planning",
                "source_type": "real_time_awareness",
                "source_id": f"{awareness.get('localDate')}-weather-adjustment",
                "title": "Adjust outdoor plans for weather",
                "description": "Weather context suggests favoring indoor work or moving outdoor blocks.",
                "reason": f"{weather.get('condition', 'Weather')} conditions may affect outdoor plans.",
                "score": 58,
                "confidence": 0.62,
                "priority": "medium",
                "due_date": awareness.get("localDate") or self.now.date().isoformat(),
                "estimated_duration_minutes": 10,
                "linked_goal_id": None,
                "linked_task_id": None,
                "suggested_start_time": self._suggest_start_for_duration(windows, 10),
                "metadata": {"awareness": self._compact_awareness(awareness)},
            }

        return None

    def _task_action(
        self,
        task: Task,
        goals_by_id: dict[str, Goal],
        windows: list[dict[str, Any]],
        active_task_ids: set[str],
    ) -> dict[str, Any]:
        today = self.now.date().isoformat()
        tomorrow = (self.now.date() + timedelta(days=1)).isoformat()
        due = _date_part(task.due_date)
        duration = int(task.estimated_duration_minutes or 30)
        score = TASK_PRIORITY_SCORE.get(task.priority, 25)
        reason_parts: list[str] = []

        if due:
            if due < today:
                score += 70
                reason_parts.append("overdue")
            elif due == today:
                score += 50
                reason_parts.append("due today")
            elif due <= tomorrow:
                score += 30
                reason_parts.append("due tomorrow")
            elif due <= (self.now.date() + timedelta(days=7)).isoformat():
                score += 15
                reason_parts.append("due this week")

        if task.status in {"in_progress", "in-progress"}:
            score += 25
            reason_parts.append("already in progress")

        if task.priority in {"critical", "high"}:
            reason_parts.append(f"{task.priority} priority")

        goal = goals_by_id.get(task.linked_goal_id or "")
        if goal:
            score += 20 + GOAL_PRIORITY_SCORE.get(goal.priority or "medium", 12)
            reason_parts.append(f"supports {goal.title}")
            target = _date_part(goal.target_date)
            if target and target <= today:
                score += 25
            elif target and target <= (self.now.date() + timedelta(days=7)).isoformat():
                score += 12

        if task.id in active_task_ids:
            score += 35
            reason_parts.insert(0, "part of the active focus block")

        if self._duration_fits_windows(duration, windows):
            score += 10
        elif duration > 90:
            score -= 8

        suggested_start = (
            _fmt_dt(self.now)
            if task.id in active_task_ids
            else task.scheduled_start or self._suggest_start_for_duration(windows, duration)
        )
        reason = ". ".join(part.capitalize() for part in reason_parts) + "." if reason_parts else "Highest-value open task."
        return {
            "type": "task",
            "source_type": "task",
            "source_id": task.id,
            "title": task.title,
            "description": _safe_text(task.description, 220) or "Move this task forward now.",
            "reason": reason,
            "score": score,
            "confidence": _confidence(score),
            "priority": task.priority,
            "due_date": task.due_date,
            "estimated_duration_minutes": duration,
            "linked_goal_id": task.linked_goal_id,
            "linked_task_id": task.id,
            "suggested_start_time": suggested_start,
            "scheduled_start": task.scheduled_start,
            "metadata": {"category": task.category, "status": task.status},
        }

    def _email_action(
        self,
        message: EmailMessage,
        classification: dict[str, Any],
        windows: list[dict[str, Any]],
    ) -> dict[str, Any]:
        duration = 20 if classification.get("actionable") else 10
        score = float(classification["score"])
        if classification["priority"] == "high":
            score += 18
        if message.status == "unread":
            score += 5
        if classification.get("category") in {"security", "finance", "calendar_invite", "school", "healthcare"}:
            score += 12
        subject = _safe_text(message.subject, 90) or "email"
        verb = "Reply to" if self.email_classifier.looks_actionable(message) else "Review"
        provider = message.source or "email"
        return {
            "type": "email",
            "source_type": "email",
            "provider": provider,
            "source_id": message.external_message_id or message.id,
            "title": f"{verb} email: {subject}",
            "description": _safe_text(message.snippet, 220) or "High-value email may require attention.",
            "reason": self._email_reason(classification),
            "score": min(score, 115),
            "confidence": _confidence(min(score, 115)),
            "priority": classification["priority"],
            "due_date": self.now.date().isoformat(),
            "estimated_duration_minutes": duration,
            "linked_goal_id": None,
            "linked_task_id": None,
            "suggested_start_time": self._suggest_start_for_duration(windows, duration),
            "metadata": {
                "email_message_id": message.id,
                "sender": _safe_text(message.sender, 180),
                "subject": _safe_text(message.subject, 220),
                "snippet": _safe_text(message.snippet, 220),
                "received_at": message.received_at,
                "importance": message.importance,
                "status": message.status,
                "source": provider,
                "classification": classification,
            },
        }

    def _calendar_action(self, event: CalendarEvent) -> dict[str, Any] | None:
        start = _parse_dt(event.start_time)
        end = _parse_dt(event.end_time)
        if not start or not end:
            return None
        metadata = {
            "calendar_event_id": event.id,
            "title": event.title,
            "start_time": event.start_time,
            "end_time": event.end_time,
            "source": event.source,
            "location": _safe_text(event.location, 220),
        }
        if start >= self.now:
            hours_until = (start - self.now).total_seconds() / 3600
            score = 74 if hours_until <= 2 else 56 if hours_until <= 24 else 38
            return {
                "type": "calendar",
                "source_type": "calendar",
                "source_id": event.external_event_id or event.id,
                "title": f"Prepare for {event.title}",
                "description": "Review notes, agenda, and materials before this commitment.",
                "reason": "Upcoming calendar commitment benefits from preparation.",
                "score": score,
                "confidence": _confidence(score),
                "priority": "high" if hours_until <= 24 else "medium",
                "due_date": start.date().isoformat(),
                "estimated_duration_minutes": 30,
                "linked_goal_id": event.linked_goal_id,
                "linked_task_id": event.linked_task_id,
                "suggested_start_time": None,
                "metadata": metadata,
            }
        if end <= self.now and end >= self.now - timedelta(hours=4):
            score = 42
            return {
                "type": "calendar",
                "source_type": "calendar",
                "source_id": event.external_event_id or event.id,
                "title": f"Follow up on {event.title}",
                "description": "Capture decisions and convert any outcomes into next actions.",
                "reason": "Recent calendar commitment may need notes, decisions, or follow-up.",
                "score": score,
                "confidence": _confidence(score),
                "priority": "medium",
                "due_date": self.now.date().isoformat(),
                "estimated_duration_minutes": 20,
                "linked_goal_id": event.linked_goal_id,
                "linked_task_id": event.linked_task_id,
                "suggested_start_time": None,
                "metadata": metadata,
            }
        return None

    def _calendar_conflict_actions(self, events: list[CalendarEvent]) -> list[dict[str, Any]]:
        parsed: list[tuple[datetime, datetime, CalendarEvent]] = []
        for event in events:
            start = _parse_dt(event.start_time)
            end = _parse_dt(event.end_time)
            if start and end:
                parsed.append((start, end, event))
        parsed.sort(key=lambda item: item[0])
        actions: list[dict[str, Any]] = []
        for index in range(1, len(parsed)):
            _prev_start, prev_end, prev_event = parsed[index - 1]
            start, _end, event = parsed[index]
            if start >= prev_end:
                continue
            actions.append({
                "type": "calendar",
                "source_type": "calendar",
                "source_id": event.id,
                "title": "Resolve calendar conflict",
                "description": f"{prev_event.title} overlaps with {event.title}.",
                "reason": "Two calendar commitments overlap and may require a decision.",
                "score": 130,
                "confidence": 0.92,
                "priority": "critical",
                "due_date": self.now.date().isoformat(),
                "estimated_duration_minutes": 10,
                "linked_goal_id": event.linked_goal_id or prev_event.linked_goal_id,
                "linked_task_id": event.linked_task_id or prev_event.linked_task_id,
                "suggested_start_time": _fmt_dt(self.now),
                "metadata": {
                    "calendar_event_id": event.id,
                    "conflict_event_ids": [prev_event.id, event.id],
                    "titles": [prev_event.title, event.title],
                },
            })
        return actions

    def _goal_actions(
        self,
        goals: list[Goal],
        tasks: list[Task],
        progress_by_goal: dict[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        open_by_goal: dict[str, int] = {}
        for task in tasks:
            if task.linked_goal_id and task.status in OPEN_TASK_STATUSES:
                open_by_goal[task.linked_goal_id] = open_by_goal.get(task.linked_goal_id, 0) + 1
        actions: list[dict[str, Any]] = []
        today = self.now.date().isoformat()
        for goal in goals:
            if open_by_goal.get(goal.id, 0) > 0:
                continue
            progress = progress_by_goal.get(goal.id, {})
            score = 42 + GOAL_PRIORITY_SCORE.get(goal.priority or "medium", 12)
            target = _date_part(goal.target_date)
            if target and target <= today:
                score += 26
            elif target and target <= (self.now.date() + timedelta(days=7)).isoformat():
                score += 14
            score += int((1 - float(progress.get("effective_progress") or 0.0)) * 12)
            actions.append({
                "type": "recovery",
                "source_type": "goals",
                "source_id": goal.id,
                "title": f"Define next milestone for {goal.title}",
                "description": "Create the next concrete task so this active goal keeps moving.",
                "reason": "Active goal has no open next task.",
                "score": score,
                "confidence": _confidence(score),
                "priority": goal.priority or "medium",
                "due_date": target or (self.now.date() + timedelta(days=2)).isoformat(),
                "estimated_duration_minutes": 45,
                "linked_goal_id": goal.id,
                "linked_task_id": None,
                "suggested_start_time": None,
                "metadata": {
                    "goal_id": goal.id,
                    "goal_title": goal.title,
                    "target_date": goal.target_date,
                    "progress": progress.get("effective_progress", 0.0),
                },
            })
        return actions

    def _planning_action(
        self,
        windows: list[dict[str, Any]],
        tasks: list[Task],
        goals: list[Goal],
    ) -> dict[str, Any] | None:
        if not windows:
            return None
        open_tasks = [task for task in tasks if task.status in OPEN_TASK_STATUSES]
        if not open_tasks and not goals:
            return None
        best = max(windows, key=lambda window: window.get("duration_minutes", 0))
        minutes = int(best.get("duration_minutes") or 0)
        if minutes < 45:
            return None
        score = 48 if minutes >= 90 else 40
        return {
            "type": "planning",
            "source_type": "planning",
            "source_id": best.get("start_time"),
            "title": f"Build a plan for your {minutes}-minute window",
            "description": "Use this open calendar window for your highest-value goal or due task.",
            "reason": "Calendar availability can be converted into focused progress.",
            "score": score,
            "confidence": _confidence(score),
            "priority": "medium",
            "due_date": self.now.date().isoformat(),
            "estimated_duration_minutes": min(minutes, 90),
            "linked_goal_id": goals[0].id if goals else None,
            "linked_task_id": open_tasks[0].id if open_tasks else None,
            "suggested_start_time": best.get("start_time"),
            "metadata": {
                "window": best,
                "open_task_count": len(open_tasks),
                "active_goal_count": len(goals),
            },
        }

    def _normalize_recommendation(self, action: dict[str, Any]) -> dict[str, Any]:
        rec_type = str(action.get("type") or "assistant")
        if rec_type not in RECOMMENDATION_TYPES:
            rec_type = "assistant"
        score = float(action.get("score") or 0)
        urgency = self._urgency_for(action, score)
        source_ids = self._source_ids_for(action)
        operation = self._operation_for(action)
        enriched = {
            **action,
            "id": action.get("id") or self._recommendation_id(rec_type, action),
            "type": rec_type,
            "title": _safe_text(action.get("title"), 96) or "Review recommendation",
            "description": _safe_text(
                action.get("description") or action.get("reason"),
                220,
            ) or "HELIOS found this from your current context.",
            "score": round(score, 2),
            "reason": _safe_text(action.get("reason"), 240) or "Highest-value recommendation from the priority engine.",
            "urgency": urgency,
            "impact": self._impact_for(action, rec_type),
            "effortMinutes": action.get("estimated_duration_minutes"),
            "sourceIds": source_ids,
            "source_entities": {
                "goal_id": source_ids.get("goalId"),
                "task_id": source_ids.get("taskId"),
                "event_id": source_ids.get("eventId"),
                "email_id": source_ids.get("emailId"),
            },
            "action": operation,
        }
        return enriched

    def _recommendation_id(self, rec_type: str, action: dict[str, Any]) -> str:
        source = (
            action.get("linked_task_id")
            or action.get("linked_goal_id")
            or action.get("metadata", {}).get("calendar_event_id")
            or action.get("metadata", {}).get("email_message_id")
            or action.get("source_id")
            or str(action.get("title", "recommendation")).lower().replace(" ", "-")
        )
        return f"{rec_type}-{source}"

    def _source_ids_for(self, action: dict[str, Any]) -> dict[str, str]:
        metadata = action.get("metadata") or {}
        result: dict[str, str] = {}
        if action.get("linked_goal_id"):
            result["goalId"] = str(action["linked_goal_id"])
        if action.get("linked_task_id"):
            result["taskId"] = str(action["linked_task_id"])
        if metadata.get("calendar_event_id"):
            result["eventId"] = str(metadata["calendar_event_id"])
        if metadata.get("email_message_id"):
            result["emailId"] = str(metadata["email_message_id"])
        return result

    def _urgency_for(self, action: dict[str, Any], score: float) -> str:
        priority = str(action.get("priority") or "").lower()
        if priority == "critical" or score >= 120:
            return "critical"
        if priority == "high" or score >= 85:
            return "high"
        if priority == "medium" or score >= 50:
            return "medium"
        return "low"

    def _impact_for(self, action: dict[str, Any], rec_type: str) -> str:
        if rec_type in {"task", "recovery"} and action.get("linked_goal_id"):
            return "high"
        if rec_type == "calendar" and str(action.get("priority")) == "critical":
            return "high"
        if rec_type == "email":
            category = str((action.get("metadata") or {}).get("classification", {}).get("category") or "")
            return "high" if category in {"security", "finance", "school", "github", "apple_developer"} else "medium"
        if rec_type in {"goal", "planning"}:
            return "medium"
        return "medium"

    def _operation_for(self, action: dict[str, Any]) -> dict[str, str]:
        rec_type = str(action.get("type") or "assistant")
        if rec_type == "task":
            return {"label": "Open Task", "route": "/(tabs)/tasks", "operation": "open_task"}
        if rec_type == "email":
            return {"label": "Review Email", "route": "/(tabs)/email", "operation": "review_email"}
        if rec_type == "calendar":
            return {"label": "Open Calendar", "route": "/(tabs)/calendar", "operation": "review_calendar"}
        if rec_type == "planning":
            return {"label": "Build My Day", "route": "/(tabs)/calendar", "operation": "build_day"}
        if rec_type == "recovery":
            return {"label": "Create Next Task", "route": "/(tabs)/goals", "operation": "create_goal_task"}
        if rec_type == "goal":
            return {"label": "Open Goal", "route": "/(tabs)/goals", "operation": "open_goal"}
        return {"label": "Ask HELIOS", "route": "/(tabs)/assistant", "operation": "ask_assistant"}

    def _next_best_from_actions(self, actions: list[dict[str, Any]], goals: list[Goal]) -> dict[str, Any]:
        if actions:
            action = actions[0]
            return {
                "id": action.get("id"),
                "type": action.get("type") or "task",
                "title": action["title"],
                "description": action.get("description") or action.get("reason"),
                "reason": action.get("reason") or "Highest-value action from the priority engine.",
                "estimated_duration_minutes": action.get("estimated_duration_minutes"),
                "effortMinutes": action.get("effortMinutes") or action.get("estimated_duration_minutes"),
                "linked_goal_id": action.get("linked_goal_id"),
                "linked_task_id": action.get("linked_task_id"),
                "suggested_start_time": action.get("suggested_start_time"),
                "confidence": action.get("confidence", 0.0),
                "score": action.get("score"),
                "source_type": action.get("source_type"),
                "sourceIds": action.get("sourceIds", {}),
                "urgency": action.get("urgency", "medium"),
                "impact": action.get("impact", "medium"),
                "action": action.get("action", {}),
            }
        if goals:
            goal = goals[0]
            return {
                "id": f"recovery-{goal.id}",
                "type": "recovery",
                "title": f"Break down '{goal.title}' into tasks",
                "description": "Create the next concrete action for this active goal.",
                "reason": "You have active goals but no open tasks. Create tasks to make progress.",
                "estimated_duration_minutes": 15,
                "effortMinutes": 15,
                "linked_goal_id": goal.id,
                "linked_task_id": None,
                "suggested_start_time": None,
                "confidence": 0.5,
                "score": 50,
                "source_type": "goals",
                "sourceIds": {"goalId": goal.id},
                "urgency": "medium",
                "impact": "high",
                "action": {"label": "Create Task", "route": "/(tabs)/goals", "operation": "create_goal_task"},
            }
        return self._empty_action()

    def _empty_action(self) -> dict[str, Any]:
        return {
            "id": "none-all-caught-up",
            "type": "none",
            "title": "All caught up",
            "description": "No high-value recommendation is available right now.",
            "reason": "No open tasks, urgent email, calendar prep, or active goals need immediate attention.",
            "estimated_duration_minutes": None,
            "effortMinutes": None,
            "linked_goal_id": None,
            "linked_task_id": None,
            "suggested_start_time": None,
            "confidence": 0.0,
            "score": 0,
            "sourceIds": {},
            "urgency": "low",
            "impact": "low",
            "action": {"label": "Ask HELIOS", "route": "/(tabs)/assistant", "operation": "ask_assistant"},
        }

    def _focus_recommendation(self, windows: list[dict[str, Any]], next_best: dict[str, Any]) -> dict[str, Any]:
        if not windows:
            return {
                "duration_minutes": next_best.get("estimated_duration_minutes"),
                "suggested_use": "Use the next available opening for the highest-value action.",
                "recommended_action": next_best.get("title") if next_best.get("type") != "none" else None,
                "confidence": next_best.get("confidence", 0.0),
            }
        duration = next_best.get("estimated_duration_minutes") or 30
        candidates = [window for window in windows if window["duration_minutes"] >= duration]
        best = candidates[0] if candidates else max(windows, key=lambda item: item["duration_minutes"])
        return {
            "start_time": best.get("start_time"),
            "end_time": best.get("end_time"),
            "duration_minutes": best.get("duration_minutes"),
            "suggested_use": best.get("suggested_use"),
            "recommended_action": next_best.get("title") if next_best.get("type") != "none" else None,
            "confidence": best.get("confidence"),
        }

    def _warnings(self, context: dict[str, Any]) -> list[str]:
        warnings: list[str] = []
        overdue = context.get("overdue_tasks") or []
        if overdue:
            warnings.append(f"{len(overdue)} overdue task{'s' if len(overdue) != 1 else ''} need attention.")
        high_unread = [
            email for email in (context.get("important_email") or [])
            if email.get("status") == "unread" and email.get("classification", {}).get("priority") == "high"
        ]
        if high_unread:
            warnings.append(f"{len(high_unread)} high-priority email{'s' if len(high_unread) != 1 else ''} may need review.")
        warnings.extend(self._calendar_conflicts(context.get("today_events") or []))
        weather = (context.get("awareness") or {}).get("weather") or {}
        if int(weather.get("precipitationChance") or 0) >= 60:
            warnings.append(f"Weather may affect outdoor plans: {weather.get('condition', 'conditions')} expected.")
        return warnings[:8]

    def _calendar_conflicts(self, events: list[dict[str, Any]]) -> list[str]:
        parsed: list[tuple[datetime, datetime, str]] = []
        for event in events:
            start = _parse_dt(event.get("start_time"))
            end = _parse_dt(event.get("end_time"))
            if start and end:
                parsed.append((start, end, str(event.get("title") or "Event")))
        parsed.sort(key=lambda item: item[0])
        warnings: list[str] = []
        for index in range(1, len(parsed)):
            _prev_start, prev_end, prev_title = parsed[index - 1]
            start, _end, title = parsed[index]
            if start < prev_end:
                warnings.append(f"Calendar conflict: {prev_title} overlaps with {title}.")
        return warnings[:3]

    def _data_sources(self, context: dict[str, Any]) -> list[str]:
        sources: list[str] = ["real_time_awareness"] if context.get("awareness") else []
        if context.get("today_events") or context.get("upcoming_events"):
            sources.append("calendar")
        if context.get("important_email"):
            provider_sources = {
                email.get("source") or "email"
                for email in context.get("important_email", [])
            }
            sources.extend(sorted(provider_sources))
        if context.get("due_tasks") or context.get("overdue_tasks") or context.get("ranked_actions"):
            sources.append("tasks")
        if context.get("goals"):
            sources.append("goals")
        if context.get("memories"):
            sources.append("ai_memory")
        if context.get("history", {}).get("recent_days"):
            sources.append("daily_history")
        if context.get("connected_services"):
            sources.append("connected_services")
        return list(dict.fromkeys(sources))

    def _action_to_suggestion_draft(self, action: dict[str, Any], *, source_type: str | None = None) -> dict[str, Any]:
        actual_source = source_type or action.get("provider") or action.get("source_type") or action.get("type") or "assistant"
        title = str(action.get("title") or "Review recommendation")[:200]
        return {
            "title": title,
            "description": _safe_text(action.get("metadata", {}).get("snippet") or action.get("reason"), 500),
            "priority": self._normalize_priority(action.get("priority")),
            "due_date": action.get("due_date") or self.now.date().isoformat(),
            "estimated_duration_minutes": action.get("estimated_duration_minutes") or 30,
            "category": self._category_label(action),
            "source_type": actual_source,
            "source_id": action.get("source_id"),
            "source_metadata": action.get("metadata") or {"priority_engine_action": action},
            "linked_goal_id": action.get("linked_goal_id"),
            "confidence": float(action.get("confidence") or 0.5),
            "reason": action.get("reason"),
        }

    def _next_best_to_suggestion_draft(self, next_best: dict[str, Any]) -> dict[str, Any]:
        return {
            "title": str(next_best.get("title") or "Create next best action")[:200],
            "description": _safe_text(next_best.get("reason"), 500),
            "priority": "high" if (next_best.get("confidence") or 0) >= 0.7 else "medium",
            "due_date": self.now.date().isoformat(),
            "estimated_duration_minutes": next_best.get("estimated_duration_minutes") or 30,
            "category": "Next Best Action",
            "source_type": "next_best_action",
            "source_id": next_best.get("linked_goal_id") or self.now.date().isoformat(),
            "source_metadata": next_best,
            "linked_goal_id": next_best.get("linked_goal_id"),
            "confidence": float(next_best.get("confidence") or 0.5),
            "reason": "Priority engine recommends this as the next best action.",
        }

    def _daily_brief_suggestion_drafts(self, user_id: str) -> list[dict[str, Any]]:
        history = self.db.execute(
            select(DailyHistory).where(
                DailyHistory.user_id == user_id,
                DailyHistory.history_date == self.now.date(),
            )
        ).scalar_one_or_none()
        if not history:
            history = (
                self.db.execute(
                    select(DailyHistory)
                    .where(DailyHistory.user_id == user_id)
                    .order_by(DailyHistory.history_date.desc())
                    .limit(1)
                )
                .scalars()
                .first()
            )
        brief = history.daily_brief if history and isinstance(history.daily_brief, dict) else {}
        next_action = brief.get("next_best_action") if isinstance(brief, dict) else None
        if not isinstance(next_action, dict) or not next_action.get("title") or next_action.get("linked_task_id"):
            return []
        brief_date = history.history_date if history else self.now.date()
        return [{
            "title": str(next_action["title"])[:200],
            "description": _safe_text(next_action.get("reason"), 500),
            "priority": "high" if (next_action.get("confidence") or 0) >= 0.75 else "medium",
            "due_date": brief_date.isoformat(),
            "estimated_duration_minutes": next_action.get("estimated_duration_minutes") or 30,
            "category": "Daily Brief",
            "source_type": "daily_brief",
            "source_id": history.id if history else self.now.date().isoformat(),
            "source_metadata": {
                "history_id": history.id if history else None,
                "brief_date": brief_date.isoformat(),
                "next_best_action": next_action,
            },
            "linked_goal_id": next_action.get("linked_goal_id"),
            "confidence": float(next_action.get("confidence") or 0.62),
            "reason": "Daily Brief identified this priority from the shared priority engine.",
        }]

    def _dedupe_drafts(self, drafts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[tuple[str, str | None, str]] = set()
        deduped: list[dict[str, Any]] = []
        for draft in sorted(drafts, key=lambda item: item.get("confidence", 0), reverse=True):
            key = (str(draft.get("source_type")), draft.get("source_id"), str(draft.get("title", "")).lower())
            if key in seen:
                continue
            seen.add(key)
            deduped.append(draft)
        return deduped

    def _compact_awareness(self, awareness: dict[str, Any]) -> dict[str, Any]:
        calendar = awareness.get("calendar") or {}
        weather = awareness.get("weather") or {}
        tasks = awareness.get("tasks") or {}
        goals = awareness.get("goals") or {}
        return {
            "now": awareness.get("now"),
            "localTime": awareness.get("localTime"),
            "localDate": awareness.get("localDate"),
            "timezone": awareness.get("timezone"),
            "dayOfWeek": awareness.get("dayOfWeek"),
            "dayPeriod": awareness.get("dayPeriod"),
            "isWeekend": awareness.get("isWeekend"),
            "weather": {
                "condition": weather.get("condition"),
                "temperature": weather.get("temperature"),
                "precipitationChance": weather.get("precipitationChance"),
            },
            "calendar": {
                "busy": calendar.get("busy"),
                "availableMinutes": calendar.get("availableMinutes"),
                "nextEvent": calendar.get("nextEvent"),
            },
            "tasks": {
                "dueToday": tasks.get("dueToday"),
                "overdue": tasks.get("overdue"),
                "remaining": tasks.get("remaining"),
            },
            "goals": {
                "activeCount": goals.get("activeCount"),
                "urgentCount": goals.get("urgentCount"),
                "goalsWithoutTasks": goals.get("goalsWithoutTasks"),
            },
        }

    def _normalize_priority(self, priority: Any) -> str:
        value = str(priority or "medium").lower()
        return value if value in {"critical", "high", "medium", "low"} else "medium"

    def _category_label(self, action: dict[str, Any]) -> str:
        action_type = action.get("type")
        if action_type == "email":
            return "Email"
        if action_type == "calendar":
            return "Calendar Prep"
        if action_type in {"goal", "recovery"}:
            return "Goal Milestone"
        if action_type == "planning":
            return "Daily Planning"
        return "Assistant Context"

    def _duration_fits_windows(self, duration: int, windows: list[dict[str, Any]]) -> bool:
        return any(window.get("duration_minutes", 0) >= duration for window in windows)

    def _suggest_start_for_duration(self, windows: list[dict[str, Any]], duration: int) -> str | None:
        for window in windows:
            if window.get("duration_minutes", 0) >= duration:
                return window.get("start_time")
        return None

    def _email_reason(self, classification: dict[str, Any]) -> str:
        category = str(classification.get("category") or "email").replace("_", " ")
        reasons = classification.get("reasons") or []
        if reasons:
            return f"{category.capitalize()} email: {reasons[0]}."
        return f"{category.capitalize()} email may need attention."

    def _append_window(self, windows: list[dict[str, Any]], start: datetime, end: datetime) -> None:
        minutes = int((end - start).total_seconds() / 60)
        if minutes < MIN_WINDOW_MINUTES:
            return
        windows.append({
            "start_time": _fmt_dt(start),
            "end_time": _fmt_dt(end),
            "duration_minutes": minutes,
            "suggested_use": self._window_use(minutes),
            "confidence": self._window_confidence(minutes),
        })

    def _window_use(self, minutes: int) -> str:
        if minutes < 30:
            return "Quick admin or email review"
        if minutes < 60:
            return "Focused task completion"
        if minutes < 120:
            return "Deep work session"
        return "Extended goal progress block"

    def _window_confidence(self, minutes: int) -> float:
        if minutes >= 90:
            return 0.9
        if minutes >= 45:
            return 0.75
        if minutes >= 30:
            return 0.6
        return 0.4

    def _claim_window(self, windows: list[dict[str, Any]], duration: int) -> dict[str, Any] | None:
        for index, window in enumerate(windows):
            if window.get("duration_minutes", 0) < duration:
                continue
            start = _parse_dt(window.get("start_time"))
            if not start:
                continue
            end = start + timedelta(minutes=duration)
            claimed = {"start_time": _fmt_dt(start), "end_time": _fmt_dt(end)}
            remaining_end = _parse_dt(window.get("end_time"))
            remaining_minutes = int(((remaining_end or end) - end).total_seconds() / 60)
            if remaining_minutes >= MIN_WINDOW_MINUTES:
                window["start_time"] = _fmt_dt(end)
                window["duration_minutes"] = remaining_minutes
                window["suggested_use"] = self._window_use(remaining_minutes)
                window["confidence"] = self._window_confidence(remaining_minutes)
            else:
                windows.pop(index)
            return claimed
        return None

    def _focus_block_to_dict(self, focus_block: FocusBlock) -> dict[str, Any]:
        return {
            "id": focus_block.id,
            "title": focus_block.title,
            "start_time": focus_block.start_time,
            "end_time": focus_block.end_time,
            "linked_goal_id": focus_block.linked_goal_id,
            "linked_task_ids": focus_block.linked_task_ids or [],
            "status": focus_block.status,
        }

    def new_calendar_event_id(self) -> str:
        return str(uuid.uuid4())
