from __future__ import annotations

import copy
import math
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.goal import Goal
from app.models.integration import UserIntegration
from app.models.task import Task
from app.models.user_preferences import UserPreferences
from app.models.user_profile import UserProfile

ACTIVE_GOAL_STATUSES = {"active", "in_progress", "in-progress", "Active", "In Progress"}
OPEN_TASK_STATUSES = {"todo", "in_progress", "in-progress"}
DONE_TASK_STATUSES = {"done", "completed"}

BUSINESS_START_HOUR = 8
BUSINESS_END_HOUR = 22
MIN_WINDOW_MINUTES = 15
CACHE_TTL_SECONDS = 60

TASK_PRIORITY_SCORE = {"critical": 4, "high": 3, "medium": 2, "low": 1}
GOAL_PRIORITY_SCORE = {"critical": 4, "high": 3, "medium": 2, "low": 1}


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


def _as_utc(value: datetime | None) -> datetime:
    if value is None:
        return datetime.min.replace(tzinfo=timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _safe_text(value: Any, limit: int = 220) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    return text[:limit] if len(text) <= limit else text[: limit - 1] + "..."


def _date_part(value: str | None) -> str | None:
    parsed = _parse_dt(value)
    if parsed:
        return parsed.date().isoformat()
    return str(value)[:10] if value else None


def _to_zone(tz_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _event_to_dict(event: CalendarEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "title": event.title,
        "description": _safe_text(event.description, 260),
        "start_time": event.start_time,
        "end_time": event.end_time,
        "location": event.location,
        "source": event.source,
        "event_type": event.event_type or "event",
        "linked_goal_id": event.linked_goal_id,
        "linked_task_id": event.linked_task_id,
    }


class RealTimeAwarenessEngine:
    """
    Central current-context service for HELIOS.

    This service owns awareness of time, local date, weather/location context,
    calendar availability, task load, goal state, integrations, and future
    device signals. AI and recommendation surfaces should consume this object
    instead of recalculating the same facts independently.
    """

    _cache: dict[tuple[str, str, str], tuple[datetime, dict[str, Any]]] = {}

    def __init__(self, db: Session, *, now: datetime | None = None) -> None:
        self.db = db
        self.now = (now or _utc_now()).astimezone(timezone.utc)
        self._explicit_now = now is not None

    def build_context(
        self,
        user_id: str,
        target_date: date | None = None,
        *,
        refresh: bool = False,
    ) -> dict[str, Any]:
        profile, prefs = self._fetch_profile_and_preferences(user_id)
        tz_name = (profile.timezone if profile else None) or "UTC"
        tz = _to_zone(tz_name)
        local_now = self.now.astimezone(tz)
        target = target_date or local_now.date()
        cache_key = (user_id, target.isoformat(), self.now.strftime("%Y-%m-%dT%H:%M"))

        if not refresh and not self._explicit_now:
            cached = self._cache.get(cache_key)
            if cached and (self.now - cached[0]).total_seconds() <= CACHE_TTL_SECONDS:
                return copy.deepcopy(cached[1])

        events = self._fetch_events_for_local_day(user_id, target, tz)
        windows = self.find_available_time_windows(user_id, target, timezone_name=tz_name)
        tasks = self._fetch_tasks(user_id)
        goals = self._fetch_goals(user_id)
        integrations = self._fetch_integrations(user_id)
        context = {
            **self._time_context(local_now, tz_name),
            "sunrise": self._sun_time(target, tz, sunrise=True),
            "sunset": self._sun_time(target, tz, sunrise=False),
            "weather": self._weather_context(profile, prefs, target),
            "location": self._location_context(profile, prefs),
            "calendar": self._calendar_context(events, windows, local_now),
            "goals": self._goal_context(goals, tasks, target),
            "tasks": self._task_context(tasks, target),
            "integrations": self._integration_context(integrations),
            "connectedServices": [self._integration_to_dict(row) for row in integrations],
            "battery": {
                "level": None,
                "charging": None,
                "source": "future_mobile_signal",
            },
            "network": {
                "online": True,
                "status": "server_online",
                "source": "backend_request",
            },
            "profile": {
                "timezone": tz_name,
                "work_focus": prefs.work_focus if prefs else None,
                "daily_brief_time": prefs.daily_brief_time if prefs else None,
                "assistant_tone": prefs.assistant_tone if prefs else None,
            },
            "generatedAt": self.now.isoformat(),
            "cacheTtlSeconds": CACHE_TTL_SECONDS,
            "source": "real_time_awareness_engine",
        }
        if not self._explicit_now:
            self._cache[cache_key] = (self.now, copy.deepcopy(context))
        return context

    def find_available_time_windows(
        self,
        user_id: str,
        target_date: date,
        *,
        timezone_name: str | None = None,
    ) -> list[dict[str, Any]]:
        tz = _to_zone(timezone_name or self._timezone_for_user(user_id))
        local_start = datetime.combine(target_date, time(BUSINESS_START_HOUR, 0), tzinfo=tz)
        local_end = datetime.combine(target_date, time(BUSINESS_END_HOUR, 0), tzinfo=tz)
        local_now = self.now.astimezone(tz)
        if target_date == local_now.date():
            local_start = max(local_start, local_now)
        if local_start >= local_end:
            return []

        day_start = local_start.astimezone(timezone.utc)
        day_end = local_end.astimezone(timezone.utc)
        events = (
            self.db.execute(
                select(CalendarEvent)
                .where(
                    CalendarEvent.user_id == user_id,
                    CalendarEvent.start_time < _fmt_dt(day_end),
                    CalendarEvent.end_time > _fmt_dt(day_start),
                )
                .order_by(CalendarEvent.start_time)
            )
            .scalars()
            .all()
        )

        busy: list[tuple[datetime, datetime]] = []
        for event in events:
            start = _parse_dt(event.start_time)
            end = _parse_dt(event.end_time)
            if not start or not end:
                continue
            clamped_start = max(start, day_start)
            clamped_end = min(end, day_end)
            if clamped_start < clamped_end:
                busy.append((clamped_start, clamped_end))
        busy.sort(key=lambda item: item[0])

        merged: list[tuple[datetime, datetime]] = []
        for start, end in busy:
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))

        windows: list[dict[str, Any]] = []
        cursor = day_start
        for busy_start, busy_end in merged:
            if busy_start > cursor:
                self._append_window(windows, cursor, busy_start)
            cursor = max(cursor, busy_end)
        if cursor < day_end:
            self._append_window(windows, cursor, day_end)
        return windows

    def _fetch_profile_and_preferences(self, user_id: str) -> tuple[UserProfile | None, UserPreferences | None]:
        profile = self.db.execute(select(UserProfile).where(UserProfile.user_id == user_id)).scalar_one_or_none()
        prefs = self.db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id)).scalar_one_or_none()
        return profile, prefs

    def _timezone_for_user(self, user_id: str) -> str:
        profile = self.db.execute(select(UserProfile).where(UserProfile.user_id == user_id)).scalar_one_or_none()
        return (profile.timezone if profile else None) or "UTC"

    def _fetch_events_for_local_day(self, user_id: str, target: date, tz: ZoneInfo) -> list[CalendarEvent]:
        start = datetime.combine(target, time.min, tzinfo=tz).astimezone(timezone.utc)
        end = datetime.combine(target, time.max, tzinfo=tz).astimezone(timezone.utc)
        return (
            self.db.execute(
                select(CalendarEvent)
                .where(
                    CalendarEvent.user_id == user_id,
                    CalendarEvent.start_time <= _fmt_dt(end),
                    CalendarEvent.end_time >= _fmt_dt(start),
                )
                .order_by(CalendarEvent.start_time)
                .limit(80)
            )
            .scalars()
            .all()
        )

    def _fetch_tasks(self, user_id: str) -> list[Task]:
        return (
            self.db.execute(
                select(Task)
                .where(Task.user_id == user_id)
                .order_by(Task.updated_at.desc())
                .limit(300)
            )
            .scalars()
            .all()
        )

    def _fetch_goals(self, user_id: str) -> list[Goal]:
        return (
            self.db.execute(
                select(Goal)
                .where(Goal.user_id == user_id, Goal.status.in_(ACTIVE_GOAL_STATUSES))
                .order_by(Goal.updated_at.desc())
                .limit(80)
            )
            .scalars()
            .all()
        )

    def _fetch_integrations(self, user_id: str) -> list[UserIntegration]:
        return (
            self.db.execute(
                select(UserIntegration)
                .where(UserIntegration.user_id == user_id)
                .order_by(UserIntegration.connected_at.desc())
            )
            .scalars()
            .all()
        )

    def _time_context(self, local_now: datetime, timezone_name: str) -> dict[str, Any]:
        return {
            "now": self.now.isoformat(),
            "localTime": local_now.strftime("%H:%M:%S"),
            "localDate": local_now.date().isoformat(),
            "timezone": timezone_name,
            "dayOfWeek": local_now.strftime("%A"),
            "month": local_now.strftime("%B"),
            "year": local_now.year,
            "dayPeriod": self._day_period(local_now.hour),
            "isWeekend": local_now.weekday() >= 5,
        }

    def _day_period(self, hour: int) -> str:
        if 5 <= hour < 12:
            return "morning"
        if 12 <= hour < 17:
            return "afternoon"
        if 17 <= hour < 22:
            return "evening"
        return "night"

    def _sun_time(self, target: date, tz: ZoneInfo, *, sunrise: bool) -> str:
        day_of_year = target.timetuple().tm_yday
        seasonal = math.cos((day_of_year - 172) / 365 * 2 * math.pi)
        if sunrise:
            hour = 6.4 - seasonal * 0.9
        else:
            hour = 18.1 + seasonal * 1.5
        whole_hour = int(hour)
        minute = int((hour - whole_hour) * 60)
        return datetime(target.year, target.month, target.day, whole_hour, minute, tzinfo=tz).isoformat()

    def _weather_context(
        self,
        profile: UserProfile | None,
        prefs: UserPreferences | None,
        target: date,
    ) -> dict[str, Any]:
        label = (prefs.primary_location if prefs else None) or (prefs.location if prefs else None)
        label = label or ", ".join(
            part for part in (
                profile.city if profile else None,
                profile.state if profile else None,
                profile.country if profile else None,
            )
            if part
        )
        month = target.month
        lower_label = (label or "").lower()
        if any(city in lower_label for city in ("seattle", "portland", "london")):
            condition = "rain"
            precipitation = 65
        elif month in {12, 1, 2}:
            condition = "cold"
            precipitation = 30
        elif month in {6, 7, 8}:
            condition = "warm"
            precipitation = 20
        else:
            condition = "mild"
            precipitation = 25
        temperature = self._estimated_temperature(month, lower_label)
        return {
            "condition": condition,
            "temperature": temperature,
            "precipitationChance": precipitation,
            "source": "estimated_from_location_and_season",
            "locationLabel": label,
            "providerReady": True,
        }

    def _estimated_temperature(self, month: int, location: str) -> int:
        base_by_month = {
            1: 38, 2: 42, 3: 52, 4: 62, 5: 71, 6: 79,
            7: 84, 8: 82, 9: 75, 10: 64, 11: 52, 12: 42,
        }
        base = base_by_month.get(month, 65)
        if any(city in location for city in ("miami", "phoenix", "austin")):
            base += 8
        if any(city in location for city in ("seattle", "chicago", "boston")):
            base -= 4
        return base

    def _location_context(
        self,
        profile: UserProfile | None,
        prefs: UserPreferences | None,
    ) -> dict[str, Any] | None:
        if profile and any([profile.city, profile.state, profile.country]):
            return {
                "city": profile.city,
                "state": profile.state,
                "country": profile.country,
                "label": ", ".join(part for part in (profile.city, profile.state, profile.country) if part),
                "source": "user_profile",
            }
        label = (prefs.primary_location if prefs else None) or (prefs.location if prefs else None)
        if not label:
            return None
        return {
            "city": label,
            "state": None,
            "country": None,
            "label": label,
            "source": "user_preferences",
        }

    def _calendar_context(
        self,
        events: list[CalendarEvent],
        windows: list[dict[str, Any]],
        local_now: datetime,
    ) -> dict[str, Any]:
        now_utc = local_now.astimezone(timezone.utc)
        parsed: list[tuple[datetime, datetime, CalendarEvent]] = []
        for event in events:
            start = _parse_dt(event.start_time)
            end = _parse_dt(event.end_time)
            if start and end:
                parsed.append((start, end, event))
        parsed.sort(key=lambda item: item[0])

        current = next((item for item in parsed if item[0] <= now_utc < item[1]), None)
        next_event = next((item for item in parsed if item[0] >= now_utc), None)
        if current:
            available_minutes = 0
        elif next_event:
            available_minutes = max(0, int((next_event[0] - now_utc).total_seconds() / 60))
        elif windows:
            available_minutes = int(windows[0].get("duration_minutes") or 0)
        else:
            available_minutes = 0

        return {
            "currentEvent": _event_to_dict(current[2]) if current else None,
            "nextEvent": _event_to_dict(next_event[2]) if next_event else None,
            "busy": current is not None,
            "availableMinutes": available_minutes,
            "freeWindows": windows,
            "eventCountToday": len(events),
        }

    def _goal_context(self, goals: list[Goal], tasks: list[Task], target: date) -> dict[str, Any]:
        open_by_goal: dict[str, int] = {}
        for task in tasks:
            if task.linked_goal_id and task.status in OPEN_TASK_STATUSES:
                open_by_goal[task.linked_goal_id] = open_by_goal.get(task.linked_goal_id, 0) + 1

        urgent = [goal for goal in goals if self._goal_is_urgent(goal, target)]
        goals_without_tasks = [goal for goal in goals if open_by_goal.get(goal.id, 0) == 0]
        stalled = [
            goal for goal in goals
            if open_by_goal.get(goal.id, 0) == 0 and _as_utc(goal.updated_at) < self.now - timedelta(days=14)
        ]
        highest = self._highest_priority_goal(goals, target)
        return {
            "activeCount": len(goals),
            "urgentCount": len(urgent),
            "goalsWithoutTasks": len(goals_without_tasks),
            "stalledCount": len(stalled),
            "highestPriorityGoal": self._goal_to_dict(highest) if highest else None,
        }

    def _goal_is_urgent(self, goal: Goal, target: date) -> bool:
        target_date = _date_part(goal.target_date)
        if goal.priority == "critical":
            return True
        if not target_date:
            return False
        return target_date <= (target + timedelta(days=7)).isoformat()

    def _highest_priority_goal(self, goals: list[Goal], target: date) -> Goal | None:
        if not goals:
            return None
        return sorted(
            goals,
            key=lambda goal: (
                GOAL_PRIORITY_SCORE.get(goal.priority or "medium", 2),
                -self._days_until(goal.target_date, target),
                _as_utc(goal.updated_at).timestamp(),
            ),
            reverse=True,
        )[0]

    def _goal_to_dict(self, goal: Goal) -> dict[str, Any]:
        return {
            "id": goal.id,
            "title": goal.title,
            "priority": goal.priority or "medium",
            "targetDate": goal.target_date,
            "status": goal.status,
        }

    def _task_context(self, tasks: list[Task], target: date) -> dict[str, Any]:
        open_tasks = [task for task in tasks if task.status not in DONE_TASK_STATUSES]
        due_today = [task for task in open_tasks if _date_part(task.due_date) == target.isoformat()]
        overdue = [
            task for task in open_tasks
            if task.due_date and (_date_part(task.due_date) or "9999-99-99") < target.isoformat()
        ]
        completed_today = [
            task for task in tasks
            if task.status in DONE_TASK_STATUSES and _as_utc(task.updated_at).date() == target
        ]
        scheduled_now = next((task for task in open_tasks if self._task_is_active_now(task)), None)
        next_task = self._highest_priority_task(open_tasks, target)
        return {
            "dueToday": len(due_today),
            "overdue": len(overdue),
            "remaining": len(open_tasks),
            "completedToday": len(completed_today),
            "estimatedWorkMinutes": sum(int(task.estimated_duration_minutes or 30) for task in open_tasks),
            "currentTask": self._task_to_dict(scheduled_now) if scheduled_now else None,
            "highestPriorityTask": self._task_to_dict(next_task) if next_task else None,
        }

    def _task_is_active_now(self, task: Task) -> bool:
        start = _parse_dt(task.scheduled_start)
        end = _parse_dt(task.scheduled_end)
        return bool(start and end and start <= self.now < end)

    def _highest_priority_task(self, tasks: list[Task], target: date) -> Task | None:
        if not tasks:
            return None
        return sorted(
            tasks,
            key=lambda task: (
                TASK_PRIORITY_SCORE.get(task.priority or "medium", 2),
                task.status in {"in_progress", "in-progress"},
                -self._days_until(task.due_date, target),
                _as_utc(task.updated_at).timestamp(),
            ),
            reverse=True,
        )[0]

    def _task_to_dict(self, task: Task) -> dict[str, Any]:
        return {
            "id": task.id,
            "title": task.title,
            "priority": task.priority,
            "status": task.status,
            "dueDate": task.due_date,
            "estimatedMinutes": task.estimated_duration_minutes,
            "linkedGoalId": task.linked_goal_id,
        }

    def _integration_context(self, integrations: list[UserIntegration]) -> dict[str, Any]:
        def connected(provider: str, service_type: str | None = None) -> bool:
            return any(
                row.status == "connected"
                and (
                    row.provider == provider
                    or (provider == "google" and row.provider in {"gmail", "google_calendar"})
                )
                and (service_type is None or row.service_type == service_type or row.provider == service_type)
                for row in integrations
            )

        return {
            "gmail": connected("google", "gmail") or connected("gmail"),
            "googleCalendar": connected("google", "calendar") or connected("google_calendar"),
            "connectedCount": len([row for row in integrations if row.status == "connected"]),
            "needsAttentionCount": len([row for row in integrations if row.status in {"needs_attention", "error"}]),
        }

    def _integration_to_dict(self, row: UserIntegration) -> dict[str, Any]:
        return {
            "provider": row.provider,
            "service_type": row.service_type,
            "status": row.status,
            "last_sync_at": row.last_sync_at.isoformat() if row.last_sync_at else None,
        }

    def _days_until(self, value: str | None, target: date) -> int:
        parsed = _date_part(value)
        if not parsed:
            return 9999
        try:
            return (date.fromisoformat(parsed) - target).days
        except ValueError:
            return 9999

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
