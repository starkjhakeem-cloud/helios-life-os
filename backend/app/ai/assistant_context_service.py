"""
Assistant Context Retrieval Service — HELIOS

Builds a structured, JSON-serializable context package before every AI call
so the model responds with full situational awareness of the user's data.

Usage:
    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(user_id, message, context_type)
    prompt_text = svc.summarize_context_for_prompt(ctx)
    ai_provider.generate_chat_reply(message, user_name, context_type, prompt_text, history)

Security: every query includes WHERE user_id = <id>. No raw OAuth tokens,
encrypted credentials, secret env values, or API keys are included in the
context package.
"""

from __future__ import annotations

import calendar
import json
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.conversation import ConversationMessage
from app.models.daily_history import DailyHistory
from app.models.email import EmailMessage
from app.models.focus_block import FocusBlock
from app.models.goal import Goal
from app.models.integration import UserIntegration
from app.models.memory import AIMemory
from app.models.task import Task
from app.models.user_preferences import UserPreferences
from app.models.user_profile import UserProfile


# ── Context type → keyword signals ─────────────────────────────────────────────
# First matching type wins, so more specific types are listed first.

_CONTEXT_KEYWORDS: dict[str, list[str]] = {
    "school": [
        "wgu", "school", "class", "course", "study", "studying", "homework",
        "assignment", "professor", "lecture", "exam", "quiz", "tutor",
        "degree", "graduate", "gpa", "credit", "c182", "d278",
    ],
    "email": [
        "email", "inbox", "unread", "reply", "respond", "sender", "mail", "newsletter",
    ],
    "calendar": [
        "calendar", "schedule", "event", "appointment", "meeting", "agenda",
        "session", "booked", "block",
    ],
    "tasks": [
        "task", "tasks", "todo", "to-do", "checklist", "finish", "complete",
        "due", "overdue", "pending", "backlog",
    ],
    "goals": [
        "goal", "goals", "objective", "milestone", "achievement", "target",
        "ambition", "resolution",
    ],
    "health": [
        "health", "fitness", "workout", "exercise", "sleep", "diet", "water",
        "weight", "run", "gym", "meditation", "steps", "calories",
    ],
    "finance": [
        "money", "finance", "budget", "expense", "income", "save", "savings",
        "spend", "bill", "payment", "debt", "invest", "bank",
    ],
    "creative": [
        "write", "design", "art", "music", "blog", "video", "podcast",
        "creative", "draft", "story",
    ],
    "work": [
        "work", "job", "office", "client", "colleague", "report",
        "presentation", "career", "professional", "manager",
    ],
    "helios_development": [
        "helios", "feature", "backend", "frontend", "api", "endpoint",
        "database", "deploy", "version", "bug", "release",
    ],
}

# Historical trigger phrases — detected before keyword matching
_HISTORICAL_TRIGGERS = frozenset({
    "what happened", "last week", "last month", "yesterday",
    "last monday", "last tuesday", "last wednesday", "last thursday",
    "last friday", "last saturday", "last sunday",
    "earlier this week", "earlier this month",
})

# Data sources to retrieve per context type
_SOURCES_FOR_TYPE: dict[str, list[str]] = {
    "general":            ["user_profile", "goals", "tasks", "calendar", "memories", "conversations", "connected_services", "daily_history"],
    "school":             ["user_profile", "goals", "tasks", "daily_history", "calendar", "memories"],
    "work":               ["user_profile", "goals", "tasks", "calendar", "email", "connected_services", "memories"],
    "goals":              ["user_profile", "goals", "tasks", "daily_history", "memories"],
    "tasks":              ["user_profile", "tasks", "goals", "calendar"],
    "calendar":           ["user_profile", "calendar", "daily_history", "tasks"],
    "email":              ["user_profile", "email", "connected_services"],
    "health":             ["user_profile", "goals", "tasks", "daily_history", "memories"],
    "finance":            ["user_profile", "goals", "tasks", "memories"],
    "creative":           ["user_profile", "goals", "tasks", "memories"],
    "helios_development": ["user_profile", "goals", "tasks", "calendar", "memories", "connected_services"],
    "agenda":             ["user_profile", "tasks", "calendar", "goals", "daily_history"],
    "historical":         ["user_profile", "daily_history", "calendar", "tasks"],
}

_WEEKDAY_INDEX = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}
_MONTH_INDEX = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}

_GOAL_CAP         = 10
_TASK_CAP         = 15
_CALENDAR_CAP     = 10
_HISTORY_DAYS_CAP = 7
_MEMORY_CAP       = 8
_CONV_MSG_CAP     = 10   # most recent messages across conversations
_PRIORITY_CAP     = 6


# ── Module-level helpers ────────────────────────────────────────────────────────

def _local_today(user_tz: str | None = None) -> date:
    if not user_tz:
        return date.today()
    try:
        return datetime.now(ZoneInfo(user_tz)).date()
    except Exception:
        return date.today()


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _format_local_clock(value: str | None, user_tz: str | None) -> str | None:
    parsed = _parse_iso_datetime(value)
    if not parsed:
        return None

    try:
        local = parsed.astimezone(ZoneInfo(user_tz)) if user_tz else parsed.astimezone()
    except Exception:
        local = parsed.astimezone(timezone.utc)

    time_label = local.strftime("%I:%M:%S %p").lstrip("0")
    tz_label = local.tzname() or user_tz or "local"
    return f"{local.strftime('%A, %B')} {local.day}, {local.year} at {time_label} {tz_label}"


def _format_live_clock_context(generated_at: str | None, user_tz: str | None) -> str:
    current_time = generated_at or datetime.now(timezone.utc).isoformat()
    lines = [
        "LIVE CLOCK:",
        f"  CURRENT TIME: {current_time}",
    ]

    local_time = _format_local_clock(current_time, user_tz)
    if local_time:
        lines.append(f"  LOCAL TIME: {local_time}")
    if user_tz:
        lines.append(f"  TIMEZONE: {user_tz}")
    lines.append("  SOURCE: backend server clock")
    lines.append("  SYNC STATUS: live")
    return "\n".join(lines)


def infer_context_type(message: str) -> str:
    """
    Infer context type from message keywords.

    Returns one of the keys in _SOURCES_FOR_TYPE, or 'general' if no match.
    Also exported so the debug endpoint can surface this derivation.
    """
    msg = message.lower()

    if any(phrase in msg for phrase in _HISTORICAL_TRIGGERS):
        return "historical"

    for ctx_type, keywords in _CONTEXT_KEYWORDS.items():
        if any(kw in msg for kw in keywords):
            return ctx_type

    return "general"


def extract_time_window(
    message: str,
    user_tz: str | None = None,
) -> tuple[date, date] | None:
    """
    Parse a time reference from the message and return (start_date, end_date).

    Returns None when no temporal reference is found. All dates are in the
    user's local timezone but represented as naive date objects.
    """
    msg = message.lower()
    today = _local_today(user_tz)

    # Specific absolute date: "June 24", "Jun 24th", "June 24, 2025"
    abs_match = re.search(
        r"\b(january|february|march|april|may|june|july|august|september|october|november|december"
        r"|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)"
        r"\s+(\d{1,2})(?:st|nd|rd|th)?(?:[\s,]+(\d{4}))?\b",
        msg,
    )
    if abs_match:
        month_num = _MONTH_INDEX.get(abs_match.group(1))
        day_num   = int(abs_match.group(2))
        year      = int(abs_match.group(3)) if abs_match.group(3) else today.year
        if month_num:
            try:
                d = date(year, month_num, day_num)
                if not abs_match.group(3) and d > today:
                    d = date(year - 1, month_num, day_num)
                return (d, d)
            except ValueError:
                pass

    # Simple relative keywords — check in order from most specific to broadest
    if re.search(r"\byesterday\b", msg):
        d = today - timedelta(days=1)
        return (d, d)

    if re.search(r"\btomorrow\b", msg):
        d = today + timedelta(days=1)
        return (d, d)

    if re.search(r"\btoday\b", msg):
        return (today, today)

    if re.search(r"\blast week\b", msg):
        start = today - timedelta(days=today.weekday() + 7)
        return (start, start + timedelta(days=6))

    if re.search(r"\bnext week\b", msg):
        start = today + timedelta(days=7 - today.weekday())
        return (start, start + timedelta(days=6))

    if re.search(r"\bthis week\b", msg):
        start = today - timedelta(days=today.weekday())
        return (start, start + timedelta(days=6))

    if re.search(r"\blast month\b", msg):
        if today.month == 1:
            y, m = today.year - 1, 12
        else:
            y, m = today.year, today.month - 1
        last_day = calendar.monthrange(y, m)[1]
        return (date(y, m, 1), date(y, m, last_day))

    if re.search(r"\bnext month\b", msg):
        if today.month == 12:
            y, m = today.year + 1, 1
        else:
            y, m = today.year, today.month + 1
        last_day = calendar.monthrange(y, m)[1]
        return (date(y, m, 1), date(y, m, last_day))

    if re.search(r"\bthis month\b", msg):
        last_day = calendar.monthrange(today.year, today.month)[1]
        return (today.replace(day=1), today.replace(day=last_day))

    # Named weekday: "last Tuesday", "next Friday", "this Wednesday"
    for prefix, direction in (("last", -1), ("next", 1), ("this", 0)):
        m = re.search(
            rf"\b{prefix}\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
            msg,
        )
        if m:
            target_wd = _WEEKDAY_INDEX[m.group(1)]
            if direction == -1:
                days_ago = (today.weekday() - target_wd) % 7 or 7
                return (today - timedelta(days=days_ago),) * 2
            elif direction == 1:
                days_ahead = (target_wd - today.weekday()) % 7 or 7
                return (today + timedelta(days=days_ahead),) * 2
            else:
                days_ahead = (target_wd - today.weekday()) % 7
                return (today + timedelta(days=days_ahead),) * 2

    return None


# ── Service ────────────────────────────────────────────────────────────────────

class AssistantContextService:
    """
    Structured context retrieval for assistant messages.

    Instantiate with a SQLAlchemy Session and call build_context_for_message()
    before every AI provider call. Pass the result through
    summarize_context_for_prompt() to get the compact string for the prompt.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Public API ─────────────────────────────────────────────────────────

    def build_context_for_message(
        self,
        user_id: str,
        message: str,
        context_type: str | None = None,
    ) -> dict[str, Any]:
        """
        Build a structured context package for a user message.

        Parameters
        ----------
        user_id      : authenticated user's ID (all queries scoped to this)
        message      : the user's latest message text
        context_type : explicit routing hint; inferred from the message if None

        The returned dict has these top-level keys:
          user_profile, current_priorities, active_goals, relevant_tasks,
          calendar_context, recent_activity, daily_history, daily_brief,
          conversation_history, connected_services, retrieval_metadata
        """
        generated_at = datetime.now(timezone.utc).isoformat()

        resolved_type = context_type or infer_context_type(message)

        # Profile is always fetched first — needed for timezone resolution
        profile_data = self._fetch_profile(user_id)
        user_tz = profile_data.get("timezone")

        time_window = extract_time_window(message, user_tz)

        sources_list = _SOURCES_FOR_TYPE.get(resolved_type, _SOURCES_FOR_TYPE["general"])

        sources_used: list[str] = []
        ctx: dict[str, Any] = {
            "user_profile":         {},
            "current_priorities":   [],
            "active_goals":         [],
            "relevant_tasks":       [],
            "calendar_context":     [],
            "recent_activity":      [],
            "daily_history":        [],
            "daily_brief":          {},
            "conversation_history": [],
            "connected_services":   [],
            "active_focus_block":   None,
            "semantic_context":     [],
        }

        # Always check for an in_progress focus block — informs every reply
        active_fb = self._fetch_active_focus_block(user_id)
        if active_fb:
            ctx["active_focus_block"] = active_fb
            sources_used.append("active_focus_block")

        for source in sources_list:
            if source == "user_profile":
                ctx["user_profile"] = profile_data
                if profile_data:
                    sources_used.append("user_profile")

            elif source == "goals":
                goals = self._fetch_goals(user_id, message)
                ctx["active_goals"] = goals
                if goals:
                    sources_used.append("goals")

            elif source == "tasks":
                tasks, priorities = self._fetch_tasks(user_id, message, time_window)
                ctx["relevant_tasks"] = tasks
                existing_ids = {p.get("id") for p in ctx["current_priorities"]}
                for p in priorities:
                    if p.get("id") not in existing_ids:
                        ctx["current_priorities"].append(p)
                        existing_ids.add(p.get("id"))
                if tasks:
                    sources_used.append("tasks")
                if priorities:
                    sources_used.append("priorities")
                # Recent activity (completed tasks) derived from task query
                activity = self._fetch_recent_activity(user_id)
                if activity:
                    ctx["recent_activity"] = activity
                    sources_used.append("recent_activity")

            elif source == "calendar":
                events = self._fetch_calendar(user_id, time_window)
                ctx["calendar_context"] = events
                if events:
                    sources_used.append("calendar")

            elif source == "daily_history":
                history, brief = self._fetch_history(user_id, time_window, user_tz)
                ctx["daily_history"] = history
                if brief:
                    ctx["daily_brief"] = brief
                if history:
                    sources_used.append("daily_history")
                if brief:
                    sources_used.append("daily_brief")

            elif source == "memories":
                memories = self._fetch_memories(user_id)
                if memories:
                    ctx["user_profile"]["long_term_memories"] = memories
                    sources_used.append("memories")

            elif source == "conversations":
                convs = self._fetch_conversation_history(user_id)
                ctx["conversation_history"] = convs
                if convs:
                    sources_used.append("conversation_history")

            elif source == "connected_services":
                services = self._fetch_connected_services(user_id)
                ctx["connected_services"] = services
                if services:
                    sources_used.append("connected_services")

            elif source == "email":
                emails = self._fetch_recent_email(user_id)
                ctx["recent_activity"].extend(emails)
                if emails:
                    sources_used.append("email")

        # Semantic search — run after all deterministic sources are gathered so
        # RAG results supplement rather than duplicate what's already in context.
        try:
            from app.services.semantic_memory_service import SemanticMemoryService
            sem_svc = SemanticMemoryService(self.db)
            sem_result = sem_svc.search(
                user_id      = user_id,
                query        = message,
                limit        = 8,
                context_type = resolved_type,
            )
            hits = sem_result.get("results") or []
            if hits:
                ctx["semantic_context"] = hits
                sources_used.append("semantic_memory")
        except Exception:
            pass  # never let RAG failure block a response

        ctx["retrieval_metadata"] = {
            "query":        message[:200],
            "context_type": resolved_type,
            "sources_used": list(dict.fromkeys(sources_used)),
            "generated_at": generated_at,
            "time_window":  {
                "start": time_window[0].isoformat() if time_window else None,
                "end":   time_window[1].isoformat() if time_window else None,
            },
        }

        return ctx

    def summarize_context_for_prompt(self, context: dict[str, Any]) -> str:
        """
        Convert a context package to a compact, prompt-ready string.

        Omits empty sections so the prompt stays lean. The result is injected
        into the AI system prompt before generating a reply.
        """
        parts: list[str] = []

        metadata = context.get("retrieval_metadata") or {}
        profile = context.get("user_profile") or {}
        parts.append(
            _format_live_clock_context(
                metadata.get("generated_at"),
                profile.get("timezone"),
            )
        )

        # User profile
        if profile:
            _pref = profile.get("assistant_name_preference") or "display_name"
            if _pref == "preferred_name" and profile.get("preferred_name"):
                name = profile["preferred_name"]
            elif _pref == "first_name" and profile.get("first_name"):
                name = profile["first_name"]
            else:
                name = (
                    profile.get("display_name")
                    or profile.get("preferred_name")
                    or profile.get("first_name")
                    or profile.get("name")
                    or "User"
                )
            lines = [f"OPERATOR: {name}"]
            if profile.get("timezone"):
                lines.append(f"TIMEZONE: {profile['timezone']}")
            if profile.get("location"):
                lines.append(f"LOCATION: {profile['location']}")
            if profile.get("work_focus"):
                lines.append(f"WORK FOCUS: {profile['work_focus']}")
            if profile.get("assistant_tone") and profile["assistant_tone"] != "balanced":
                lines.append(f"PREFERRED TONE: {profile['assistant_tone']}")
            areas = profile.get("important_life_areas") or []
            if areas:
                lines.append(f"LIFE AREAS: {', '.join(areas)}")
            memories = profile.get("long_term_memories") or []
            if memories:
                lines.append("KNOWN ABOUT USER:")
                for m in memories:
                    lines.append(f"  [{m.get('type', 'fact').upper()}] {m.get('content', '')}")
            parts.append("\n".join(lines))

        # Active goals
        goals = context.get("active_goals") or []
        if goals:
            lines = [f"ACTIVE GOALS ({len(goals)}):"]
            for g in goals:
                target = f" (target: {g['target_date']})" if g.get("target_date") else ""
                lines.append(f"  - {g['title']}{target}")
            parts.append("\n".join(lines))

        # Current priorities
        priorities = context.get("current_priorities") or []
        if priorities:
            lines = [f"CURRENT PRIORITIES ({len(priorities)}):"]
            for p in priorities[:_PRIORITY_CAP]:
                tag = f"[{p.get('priority', 'medium').upper()}]"
                due = f" due {p['due_date']}" if p.get("due_date") else ""
                lines.append(f"  - [{p.get('type', 'task').upper()}] {tag} {p['title']}{due}")
            parts.append("\n".join(lines))

        # Relevant tasks
        tasks = context.get("relevant_tasks") or []
        if tasks:
            lines = [f"RELEVANT TASKS ({len(tasks)}):"]
            for t in tasks:
                status = f"[{t.get('status', 'todo').upper()}]"
                due = f" (due: {t['due_date']})" if t.get("due_date") else ""
                lines.append(f"  - {status} [{t.get('priority', 'medium').upper()}] {t['title']}{due}")
            parts.append("\n".join(lines))

        # Calendar
        calendar_events = context.get("calendar_context") or []
        if calendar_events:
            lines = [f"CALENDAR EVENTS ({len(calendar_events)}):"]
            for ev in calendar_events:
                start = (ev.get("start_time") or "")[:16].replace("T", " ")
                loc = f" @ {ev['location']}" if ev.get("location") else ""
                lines.append(f"  - {ev['title']} [{start}]{loc}")
            parts.append("\n".join(lines))

        # Daily history
        history = context.get("daily_history") or []
        if history:
            lines = [f"DAILY HISTORY (last {len(history)} days):"]
            for h in history:
                d = h.get("date", "")
                summary = (h.get("summary") or "")[:120]
                completed = h.get("completed_tasks") or []
                line = f"  {d}:"
                if summary:
                    line += f" {summary}"
                if completed:
                    line += f" ({len(completed)} tasks completed)"
                lines.append(line)
            parts.append("\n".join(lines))

        # Latest daily brief
        brief = context.get("daily_brief") or {}
        if brief:
            label = f"LATEST DAILY BRIEF ({brief['date']}):" if brief.get("date") else "LATEST DAILY BRIEF:"
            lines = [label]
            if brief.get("summary"):
                lines.append(f"  {brief['summary'][:200]}")
            for p in (brief.get("priorities") or [])[:3]:
                if isinstance(p, dict):
                    lines.append(f"  - {p.get('label', '')}: {p.get('detail', '')[:80]}")
                elif isinstance(p, str):
                    lines.append(f"  - {p[:80]}")
            parts.append("\n".join(lines))

        # Conversation history
        conv_hist = context.get("conversation_history") or []
        if conv_hist:
            lines = [f"RECENT CONVERSATION ({len(conv_hist)} messages):"]
            for msg in conv_hist:
                role = "USER" if msg.get("role") == "user" else "HELIOS"
                content = (msg.get("content") or "")[:150]
                lines.append(f"  {role}: {content}")
            parts.append("\n".join(lines))

        # Recent activity (completed tasks)
        activity = context.get("recent_activity") or []
        task_activity = [a for a in activity if a.get("type") != "email"]
        email_activity = [a for a in activity if a.get("type") == "email"]

        if task_activity:
            lines = [f"RECENT ACTIVITY ({len(task_activity)} items):"]
            for a in task_activity[:5]:
                lines.append(f"  - [{a.get('date', '')}] {a.get('description', '')}")
            parts.append("\n".join(lines))

        if email_activity:
            lines = [f"UNREAD EMAIL ({len(email_activity)} messages):"]
            for e in email_activity[:5]:
                imp = e.get("importance", "normal").upper()
                lines.append(f"  - [{imp}] {e.get('subject', '')} (from: {e.get('sender', '')})")
            parts.append("\n".join(lines))

        # Semantic memory (RAG) — meaning-based context retrieval
        sem_hits = context.get("semantic_context") or []
        if sem_hits:
            lines = ["RELEVANT HELIOS MEMORY:"]
            for hit in sem_hits:
                label  = f"[{hit.get('source_type', 'memory')}]"
                title  = hit.get("title", "")
                summary= hit.get("content_summary") or ""
                if summary and summary != title:
                    lines.append(f"  - {label} {title} — {summary[:180]}")
                else:
                    lines.append(f"  - {label} {title}")
            parts.append("\n".join(lines))

        # Connected services
        services = context.get("connected_services") or []
        if services:
            svc_strs = []
            for s in services:
                label = f"{s.get('provider', '')} {s.get('service_type', '')}".strip()
                sync = f" (synced: {str(s.get('last_sync_at', ''))[:10]})" if s.get("last_sync_at") else ""
                svc_strs.append(f"{label} [{s.get('status', 'unknown')}]{sync}")
            parts.append(f"CONNECTED SERVICES: {', '.join(svc_strs)}")

        # Active focus block — highest priority context signal
        fb = context.get("active_focus_block")
        if fb:
            lines = [f"⚡ ACTIVE FOCUS BLOCK: {fb['title']}"]
            lines.append(f"  Scheduled: {fb.get('start_time', '')[:16].replace('T', ' ')} – {fb.get('end_time', '')[:16].replace('T', ' ')}Z")
            if fb.get("actual_start"):
                lines.append(f"  Started at: {fb['actual_start'][:16].replace('T', ' ')}Z")
            if fb.get("linked_goal_id") and fb.get("linked_goal_title"):
                lines.append(f"  Goal: {fb['linked_goal_title']}")
            task_count = len(fb.get("linked_task_ids") or [])
            if task_count:
                lines.append(f"  Tasks assigned: {task_count}")
            parts.insert(0, "\n".join(lines))  # inject at top so it's seen first

        return "\n\n".join(parts)

    # ── Private retrieval ──────────────────────────────────────────────────

    def _fetch_active_focus_block(self, user_id: str) -> dict[str, Any] | None:
        """Return the currently in_progress focus block for this user, or None."""
        fb = self.db.execute(
            select(FocusBlock).where(
                FocusBlock.user_id == user_id,
                FocusBlock.status  == "in_progress",
            )
        ).scalar_one_or_none()

        if not fb:
            return None

        # Fetch the linked goal title for the summarizer
        linked_goal_title: str | None = None
        if fb.linked_goal_id:
            from app.models.goal import Goal as _Goal
            g = self.db.execute(
                select(_Goal).where(
                    _Goal.id      == fb.linked_goal_id,
                    _Goal.user_id == user_id,
                )
            ).scalar_one_or_none()
            if g:
                linked_goal_title = g.title

        return {
            "id":                fb.id,
            "title":             fb.title,
            "start_time":        fb.start_time,
            "end_time":          fb.end_time,
            "status":            fb.status,
            "actual_start":      fb.actual_start,
            "linked_goal_id":    fb.linked_goal_id,
            "linked_goal_title": linked_goal_title,
            "linked_task_ids":   fb.linked_task_ids or [],
        }

    def _fetch_profile(self, user_id: str) -> dict[str, Any]:
        profile = self.db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        ).scalar_one_or_none()
        prefs = self.db.execute(
            select(UserPreferences).where(UserPreferences.user_id == user_id)
        ).scalar_one_or_none()

        result: dict[str, Any] = {}
        if profile:
            full_name = (
                profile.display_name
                or f"{profile.first_name or ''} {profile.last_name or ''}".strip()
                or None
            )
            result["name"] = full_name
            result["display_name"] = profile.display_name
            result["first_name"] = profile.first_name
            result["timezone"] = profile.timezone or "UTC"
            result["location"] = ", ".join(
                filter(None, [profile.city, profile.state])
            ) or None
        if prefs:
            result["preferred_name"] = prefs.preferred_name
            result["assistant_name_preference"] = prefs.assistant_name_preference or "display_name"
            if not result.get("location"):
                result["location"] = prefs.primary_location or prefs.location or None
            result["work_focus"] = prefs.work_focus
            result["assistant_tone"] = prefs.assistant_tone
            result["daily_brief_time"] = prefs.daily_brief_time
            try:
                areas = json.loads(prefs.important_life_areas) if prefs.important_life_areas else []
            except (ValueError, TypeError):
                areas = []
            result["important_life_areas"] = areas
        return result

    def _fetch_goals(self, user_id: str, message: str) -> list[dict[str, Any]]:
        rows = (
            self.db.execute(
                select(Goal)
                .where(Goal.user_id == user_id, Goal.status == "active")
                .order_by(Goal.created_at.desc())
                .limit(_GOAL_CAP)
            )
            .scalars()
            .all()
        )
        msg_words = set(message.lower().split())

        def _relevance(g: Goal) -> int:
            title_words = set((g.title or "").lower().split())
            return -len(title_words & msg_words)

        return [
            {
                "id":          g.id,
                "title":       g.title,
                "description": g.description,
                "target_date": g.target_date,
                "status":      g.status,
            }
            for g in sorted(rows, key=_relevance)
        ]

    def _fetch_tasks(
        self,
        user_id: str,
        message: str,
        time_window: tuple[date, date] | None,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        today = date.today()
        tomorrow = today + timedelta(days=1)

        open_tasks = (
            self.db.execute(
                select(Task)
                .where(Task.user_id == user_id, Task.status.in_(["todo", "in_progress"]))
                .order_by(Task.updated_at.desc())
                .limit(60)
            )
            .scalars()
            .all()
        )

        today_iso    = today.isoformat()
        tomorrow_iso = tomorrow.isoformat()
        msg_words    = {w for w in message.lower().split() if len(w) > 3}

        relevant: list[Task]            = []
        priorities: list[dict[str, Any]] = []

        for t in open_tasks:
            is_urgent = (
                t.status == "in_progress"
                or t.priority in ("high", "critical")
                or (t.due_date and t.due_date <= today_iso)
            )
            is_relevant = bool(
                msg_words
                and any(
                    w in (t.title + " " + (t.description or "")).lower()
                    for w in msg_words
                )
            )

            if is_urgent or is_relevant:
                relevant.append(t)

            if t.status == "in_progress" or (
                t.due_date and t.due_date <= tomorrow_iso and t.status != "done"
            ):
                priorities.append({
                    "id":       t.id,
                    "type":     "task",
                    "title":    t.title,
                    "priority": t.priority,
                    "due_date": t.due_date,
                    "status":   t.status,
                })

        # For historical time windows, also surface completed tasks from that period
        if time_window and time_window[1] < today:
            start_dt = datetime(
                time_window[0].year, time_window[0].month, time_window[0].day,
                tzinfo=timezone.utc,
            )
            end_dt = datetime(
                time_window[1].year, time_window[1].month, time_window[1].day,
                23, 59, 59, tzinfo=timezone.utc,
            )
            done_tasks = (
                self.db.execute(
                    select(Task)
                    .where(
                        Task.user_id == user_id,
                        Task.status == "done",
                        Task.updated_at >= start_dt,
                        Task.updated_at <= end_dt,
                    )
                    .order_by(Task.updated_at.desc())
                    .limit(20)
                )
                .scalars()
                .all()
            )
            relevant.extend(done_tasks)

        tasks_out = [
            {
                "id":          t.id,
                "title":       t.title,
                "status":      t.status,
                "priority":    t.priority,
                "due_date":    t.due_date,
                "description": t.description,
            }
            for t in relevant[:_TASK_CAP]
        ]
        return tasks_out, priorities[:_PRIORITY_CAP]

    def _fetch_calendar(
        self,
        user_id: str,
        time_window: tuple[date, date] | None,
    ) -> list[dict[str, Any]]:
        today = date.today()
        if time_window:
            start, end = time_window
        else:
            start = today - timedelta(days=7)
            end   = today + timedelta(days=14)

        start_iso = start.isoformat() + "T00:00:00"
        end_iso   = end.isoformat()   + "T23:59:59"

        rows = (
            self.db.execute(
                select(CalendarEvent)
                .where(
                    CalendarEvent.user_id == user_id,
                    CalendarEvent.start_time >= start_iso,
                    CalendarEvent.start_time <= end_iso,
                )
                .order_by(CalendarEvent.start_time)
                .limit(_CALENDAR_CAP)
            )
            .scalars()
            .all()
        )
        return [
            {
                "title":      ev.title,
                "start_time": ev.start_time,
                "end_time":   ev.end_time,
                "location":   ev.location,
            }
            for ev in rows
        ]

    def _fetch_history(
        self,
        user_id: str,
        time_window: tuple[date, date] | None,
        user_tz: str = "UTC",
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        today = _local_today(user_tz)
        if time_window:
            start = time_window[0]
            end   = time_window[1]
        else:
            start = today - timedelta(days=30)
            end   = today

        rows = (
            self.db.execute(
                select(DailyHistory)
                .where(
                    DailyHistory.user_id == user_id,
                    DailyHistory.history_date >= start,
                    DailyHistory.history_date <= end,
                )
                .order_by(DailyHistory.history_date.desc())
                .limit(_HISTORY_DAYS_CAP)
            )
            .scalars()
            .all()
        )

        history: list[dict[str, Any]] = []
        latest_brief: dict[str, Any] = {}

        for h in rows:
            history.append({
                "date":               h.history_date.isoformat(),
                "summary":            h.summary,
                "completed_tasks":    h.completed_tasks or [],
                "planned_tasks":      h.planned_tasks  or [],
                "overdue_tasks":      h.overdue_tasks  or [],
                "calendar_events":    h.calendar_events or [],
                "assistant_activity": h.assistant_activity or [],
                "notes":              h.notes,
            })
            if not latest_brief and h.daily_brief:
                try:
                    brief_raw = (
                        h.daily_brief
                        if isinstance(h.daily_brief, dict)
                        else json.loads(h.daily_brief)
                    )
                    latest_brief = {"date": h.history_date.isoformat(), **brief_raw}
                except (ValueError, TypeError):
                    pass

        return history, latest_brief

    def _fetch_memories(self, user_id: str) -> list[dict[str, Any]]:
        rows = (
            self.db.execute(
                select(AIMemory)
                .where(AIMemory.user_id == user_id)
                .order_by(AIMemory.created_at.desc())
                .limit(_MEMORY_CAP)
            )
            .scalars()
            .all()
        )
        return [{"type": m.memory_type, "content": m.content} for m in rows]

    def _fetch_conversation_history(self, user_id: str) -> list[dict[str, Any]]:
        rows = (
            self.db.execute(
                select(ConversationMessage)
                .where(
                    ConversationMessage.user_id == user_id,
                    ConversationMessage.content != "",
                )
                .order_by(ConversationMessage.created_at.desc())
                .limit(_CONV_MSG_CAP)
            )
            .scalars()
            .all()
        )
        return [
            {
                "role":       m.role,
                "content":    m.content[:300],
                "created_at": m.created_at.isoformat(),
            }
            for m in reversed(rows)
        ]

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
                "provider":     i.provider,
                "service_type": i.service_type,
                "display_name": i.display_name or i.email,
                "status":       i.status,
                "last_sync_at": i.last_sync_at.isoformat() if i.last_sync_at else None,
                # access_token_encrypted and refresh_token_encrypted are deliberately omitted
            }
            for i in rows
        ]

    def _fetch_recent_email(self, user_id: str) -> list[dict[str, Any]]:
        _IMPORTANCE_RANK = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
        rows = (
            self.db.execute(
                select(EmailMessage)
                .where(EmailMessage.user_id == user_id, EmailMessage.status == "unread")
                .order_by(EmailMessage.received_at.desc())
                .limit(20)
            )
            .scalars()
            .all()
        )
        sorted_rows = sorted(rows, key=lambda r: _IMPORTANCE_RANK.get(r.importance, 2))
        return [
            {
                "type":        "email",
                "subject":     r.subject,
                "sender":      r.sender,
                "importance":  r.importance,
                "received_at": r.received_at,
            }
            for r in sorted_rows[:5]
        ]

    def _fetch_recent_activity(self, user_id: str) -> list[dict[str, Any]]:
        since = date.today() - timedelta(days=14)
        since_dt = datetime(since.year, since.month, since.day, tzinfo=timezone.utc)
        rows = (
            self.db.execute(
                select(Task)
                .where(
                    Task.user_id == user_id,
                    Task.status == "done",
                    Task.updated_at >= since_dt,
                )
                .order_by(Task.updated_at.desc())
                .limit(10)
            )
            .scalars()
            .all()
        )
        return [
            {
                "type":        "completed_task",
                "date":        t.updated_at.date().isoformat(),
                "description": f'Completed: "{t.title}"',
            }
            for t in rows
        ]
