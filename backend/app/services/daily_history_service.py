from __future__ import annotations

import calendar as calendar_lib
import json
import uuid
from datetime import date, datetime, time, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import ConversationMessage
from app.models.daily_history import DailyHistory
from app.models.daily_snapshot import DailyMemorySnapshot
from app.models.sync_job import SyncJob
from app.schemas.daily_history import DailyHistoryGenerateRequest, DailyHistoryNotesUpdate
from app.services.daily_snapshot_service import build_snapshot_payload


PERSONAL_KEYWORDS = {
    "family",
    "health",
    "workout",
    "exercise",
    "creative",
    "personal",
    "journal",
    "reflection",
    "photography",
    "recovery",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return _utc_now().date()


def _day_bounds(target_date: date) -> tuple[datetime, datetime]:
    return (
        datetime.combine(target_date, time.min, tzinfo=timezone.utc),
        datetime.combine(target_date, time.max, tzinfo=timezone.utc),
    )


def _day_type(target_date: date) -> str:
    today = _today()
    if target_date < today:
        return "past"
    if target_date > today:
        return "future"
    return "today"


def _default_status(target_date: date) -> str:
    return "planned" if _day_type(target_date) == "future" else "open"


def _json_loads(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        decoded = json.loads(raw)
        return decoded if isinstance(decoded, dict) else None
    except (TypeError, json.JSONDecodeError):
        return None


def _snapshot_to_payload(snapshot: DailyMemorySnapshot) -> dict[str, Any]:
    progress_by_goal = {
        item.get("goal_id"): item
        for item in (snapshot.goal_progress or [])
        if isinstance(item, dict)
    }
    goals_snapshot: list[dict[str, Any]] = []
    for goal in snapshot.active_goals or []:
        if not isinstance(goal, dict):
            continue
        merged = dict(goal)
        progress = progress_by_goal.get(goal.get("id"))
        if progress:
            merged["progress"] = progress.get("progress")
            merged["linked_tasks"] = progress.get("linked_tasks")
            merged["completed_tasks"] = progress.get("completed_tasks")
        goals_snapshot.append(merged)
    return {
        "completed_tasks": snapshot.tasks_completed or [],
        "planned_tasks": snapshot.tasks_planned or [],
        "overdue_tasks": snapshot.overdue_tasks or [],
        "goals_snapshot": goals_snapshot,
        "calendar_events": snapshot.calendar_events or [],
        "focus_blocks": snapshot.focus_blocks or [],
        "daily_brief": snapshot.daily_brief,
        "assistant_activity": snapshot.assistant_activity or [],
        "integration_activity": [snapshot.connected_service_sync] if snapshot.connected_service_sync else [],
        "notes": snapshot.notes,
        "metadata": {"source_snapshot_id": snapshot.id, "source": "daily_memory_snapshot"},
    }


def _source_snapshot(db: Session, user_id: str, target_date: date) -> DailyMemorySnapshot | None:
    return db.execute(
        select(DailyMemorySnapshot).where(
            DailyMemorySnapshot.user_id == user_id,
            DailyMemorySnapshot.snapshot_date == target_date,
        )
    ).scalar_one_or_none()


def _assistant_activity(db: Session, user_id: str, target_date: date) -> list[dict[str, Any]]:
    start, end = _day_bounds(target_date)
    rows = db.execute(
        select(ConversationMessage)
        .where(
            ConversationMessage.user_id == user_id,
            ConversationMessage.role == "assistant",
            ConversationMessage.created_at >= start,
            ConversationMessage.created_at <= end,
        )
        .order_by(ConversationMessage.created_at)
        .limit(50)
    ).scalars().all()
    return [
        {
            "id": row.id,
            "conversation_id": row.conversation_id,
            "role": row.role,
            "content_preview": row.content[:500],
            "metadata": _json_loads(row.meta),
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


def _integration_activity(db: Session, user_id: str, target_date: date) -> list[dict[str, Any]]:
    start, end = _day_bounds(target_date)
    rows = db.execute(
        select(SyncJob)
        .where(
            SyncJob.user_id == user_id,
            SyncJob.started_at >= start,
            SyncJob.started_at <= end,
        )
        .order_by(SyncJob.started_at)
        .limit(100)
    ).scalars().all()
    return [
        {
            "id": row.id,
            "provider": row.provider,
            "service_type": row.service_type,
            "status": row.status,
            "started_at": row.started_at.isoformat(),
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            "records_created": row.records_created,
            "records_updated": row.records_updated,
            "records_skipped": row.records_skipped,
            "error_message": row.error_message,
        }
        for row in rows
    ]


def _goals_snapshot_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    progress_by_goal = {
        item.get("goal_id"): item
        for item in (payload.get("goal_progress") or [])
        if isinstance(item, dict)
    }
    goals: list[dict[str, Any]] = []
    for goal in payload.get("active_goals") or []:
        if not isinstance(goal, dict):
            continue
        merged = dict(goal)
        progress = progress_by_goal.get(goal.get("id"))
        if progress:
            merged["progress"] = progress.get("progress")
            merged["linked_tasks"] = progress.get("linked_tasks")
            merged["completed_tasks"] = progress.get("completed_tasks")
        goals.append(merged)
    return goals


def _build_payload(
    db: Session,
    user_id: str,
    target_date: date,
    request: DailyHistoryGenerateRequest | None,
) -> dict[str, Any]:
    snapshot = _source_snapshot(db, user_id, target_date)
    if snapshot:
        payload = _snapshot_to_payload(snapshot)
    else:
        snapshot_payload = build_snapshot_payload(db, user_id, target_date, extras=None)
        payload = {
            "completed_tasks": snapshot_payload["tasks_completed"],
            "planned_tasks": snapshot_payload["tasks_planned"],
            "overdue_tasks": snapshot_payload["overdue_tasks"],
            "goals_snapshot": _goals_snapshot_from_payload(snapshot_payload),
            "calendar_events": snapshot_payload["calendar_events"],
            "focus_blocks": snapshot_payload["focus_blocks"],
            "daily_brief": snapshot_payload["daily_brief"],
            "assistant_activity": snapshot_payload["assistant_activity"],
            "integration_activity": (
                [snapshot_payload["connected_service_sync"]]
                if snapshot_payload["connected_service_sync"]
                else []
            ),
            "notes": snapshot_payload["notes"],
            "metadata": {"source": "generated_from_current_state"},
        }

    if request:
        if request.daily_brief is not None:
            payload["daily_brief"] = request.daily_brief
        if request.focus_blocks is not None:
            payload["focus_blocks"] = request.focus_blocks
        if request.assistant_activity is not None:
            payload["assistant_activity"] = request.assistant_activity
        if request.integration_activity is not None:
            payload["integration_activity"] = request.integration_activity
        if request.notes is not None:
            payload["notes"] = request.notes
        if request.metadata is not None:
            metadata = dict(payload.get("metadata") or {})
            metadata.update(request.metadata)
            payload["metadata"] = metadata
        if request.summary is not None:
            payload["summary"] = request.summary

    if not payload.get("assistant_activity"):
        payload["assistant_activity"] = _assistant_activity(db, user_id, target_date)
    if not payload.get("integration_activity"):
        payload["integration_activity"] = _integration_activity(db, user_id, target_date)

    payload.setdefault("summary", _summary_from_payload(payload))
    return payload


def _focus_minutes(focus_blocks: list[dict[str, Any]]) -> int:
    total = 0
    for block in focus_blocks:
        if not isinstance(block, dict):
            continue
        for key in ("duration_minutes", "minutes", "estimated_minutes"):
            value = block.get(key)
            if isinstance(value, int):
                total += value
                break
    return total


def _has_personal(history: DailyHistory | dict[str, Any]) -> bool:
    notes = history.notes if isinstance(history, DailyHistory) else history.get("notes")
    if notes:
        return True
    events = history.calendar_events if isinstance(history, DailyHistory) else history.get("calendar_events", [])
    focus_blocks = history.focus_blocks if isinstance(history, DailyHistory) else history.get("focus_blocks", [])
    text_parts: list[str] = []
    for item in list(events or []) + list(focus_blocks or []):
        if isinstance(item, dict):
            text_parts.append(str(item.get("title") or item.get("activity") or item.get("category") or ""))
            text_parts.append(str(item.get("description") or ""))
    combined = " ".join(text_parts).lower()
    return any(keyword in combined for keyword in PERSONAL_KEYWORDS)


def _summary_from_payload(payload: dict[str, Any]) -> str:
    brief = payload.get("daily_brief")
    if isinstance(brief, dict) and brief.get("summary"):
        return str(brief["summary"])
    event_count = len(payload.get("calendar_events") or [])
    completed_count = len(payload.get("completed_tasks") or [])
    planned_count = len(payload.get("planned_tasks") or [])
    if event_count or completed_count or planned_count:
        return (
            f"{event_count} event{'s' if event_count != 1 else ''}, "
            f"{completed_count} completed task{'s' if completed_count != 1 else ''}, "
            f"and {planned_count} planned task{'s' if planned_count != 1 else ''}."
        )
    return "No significant activity recorded yet."


class DailyHistoryService:
    def __init__(self, db: Session, user_id: str) -> None:
        self.db = db
        self.user_id = user_id

    def get_day(self, target_date: date) -> DailyHistory | None:
        return self.db.execute(
            select(DailyHistory).where(
                DailyHistory.user_id == self.user_id,
                DailyHistory.history_date == target_date,
            )
        ).scalar_one_or_none()

    def get_range(self, start_date: date, end_date: date) -> list[DailyHistory]:
        return self.db.execute(
            select(DailyHistory)
            .where(
                DailyHistory.user_id == self.user_id,
                DailyHistory.history_date >= start_date,
                DailyHistory.history_date <= end_date,
            )
            .order_by(DailyHistory.history_date)
        ).scalars().all()

    def generate_day_history(
        self,
        target_date: date,
        request: DailyHistoryGenerateRequest | None = None,
    ) -> DailyHistory:
        request = request or DailyHistoryGenerateRequest()
        existing = self.get_day(target_date)
        should_preserve = (
            existing is not None
            and not request.regenerate
            and (existing.status == "locked" or target_date < _today())
        )
        if should_preserve:
            return existing

        now = _utc_now()
        payload = _build_payload(self.db, self.user_id, target_date, request)
        if existing is None:
            existing = DailyHistory(
                id=str(uuid.uuid4()),
                user_id=self.user_id,
                history_date=target_date,
                created_at=now,
                updated_at=now,
                completed_tasks=[],
                planned_tasks=[],
                overdue_tasks=[],
                goals_snapshot=[],
                calendar_events=[],
                focus_blocks=[],
                assistant_activity=[],
                integration_activity=[],
                status=_default_status(target_date),
                timezone=request.timezone or "UTC",
                day_type=_day_type(target_date),
            )
            self.db.add(existing)

        existing.timezone = request.timezone or existing.timezone or "UTC"
        existing.day_type = _day_type(target_date)
        if existing.status != "locked":
            existing.status = _default_status(target_date)
        existing.summary = payload.get("summary") or _summary_from_payload(payload)
        existing.daily_brief = payload.get("daily_brief")
        existing.completed_tasks = payload.get("completed_tasks") or []
        existing.planned_tasks = payload.get("planned_tasks") or []
        existing.overdue_tasks = payload.get("overdue_tasks") or []
        existing.goals_snapshot = payload.get("goals_snapshot") or []
        existing.calendar_events = payload.get("calendar_events") or []
        existing.focus_blocks = payload.get("focus_blocks") or []
        existing.assistant_activity = payload.get("assistant_activity") or []
        existing.integration_activity = payload.get("integration_activity") or []
        if payload.get("notes") is not None:
            existing.notes = payload.get("notes")
        existing.metadata_json = payload.get("metadata")
        existing.updated_at = now
        self.db.commit()
        self.db.refresh(existing)
        return existing

    def update_today(self) -> DailyHistory:
        return self.generate_day_history(_today(), DailyHistoryGenerateRequest(regenerate=True))

    def lock_day(self, target_date: date) -> DailyHistory:
        if target_date > _today():
            raise ValueError("Future days cannot be locked.")
        history = self.get_day(target_date) or self.generate_day_history(target_date)
        now = _utc_now()
        history.day_type = _day_type(target_date)
        history.status = "locked"
        history.locked_at = history.locked_at or now
        history.updated_at = now
        self.db.commit()
        self.db.refresh(history)
        return history

    def update_notes(self, target_date: date, payload: DailyHistoryNotesUpdate) -> DailyHistory:
        history = self.get_day(target_date) or self.generate_day_history(target_date)
        history.notes = payload.notes
        if payload.metadata is not None:
            metadata = dict(history.metadata_json or {})
            metadata.update(payload.metadata)
            history.metadata_json = metadata
        history.updated_at = _utc_now()
        self.db.commit()
        self.db.refresh(history)
        return history

    def classify_activity(self, history: DailyHistory | dict[str, Any]) -> dict[str, Any]:
        events = history.calendar_events if isinstance(history, DailyHistory) else history.get("calendar_events", [])
        completed = history.completed_tasks if isinstance(history, DailyHistory) else history.get("completed_tasks", [])
        planned = history.planned_tasks if isinstance(history, DailyHistory) else history.get("planned_tasks", [])
        focus_blocks = history.focus_blocks if isinstance(history, DailyHistory) else history.get("focus_blocks", [])
        daily_brief = history.daily_brief if isinstance(history, DailyHistory) else history.get("daily_brief")
        notes = history.notes if isinstance(history, DailyHistory) else history.get("notes")
        assistant = history.assistant_activity if isinstance(history, DailyHistory) else history.get("assistant_activity", [])
        integration = history.integration_activity if isinstance(history, DailyHistory) else history.get("integration_activity", [])

        focus_minutes = _focus_minutes(focus_blocks or [])
        event_count = len(events or [])
        completed_count = len(completed or [])
        planned_count = len(planned or [])
        score = (
            event_count
            + completed_count
            + planned_count
            + (focus_minutes // 30)
            + min(len(assistant or []), 2)
            + min(len(integration or []), 1)
        )
        if score >= 5:
            activity_level = "high"
        elif score >= 2:
            activity_level = "medium"
        else:
            activity_level = "low"
        return {
            "has_events": event_count > 0,
            "has_tasks": completed_count > 0 or planned_count > 0,
            "has_focus": focus_minutes > 0 or bool(focus_blocks),
            "has_personal": _has_personal(history),
            "activity_level": activity_level,
            "event_count": event_count,
            "completed_task_count": completed_count,
            "planned_task_count": planned_count,
            "focus_minutes": focus_minutes,
            "brief_available": bool(daily_brief),
            "notes_available": bool(notes),
        }

    def build_day_summary(self, target_date: date, history: DailyHistory | None = None) -> dict[str, Any]:
        history = history or self.get_day(target_date)
        if history:
            classification = self.classify_activity(history)
        else:
            classification = self.classify_activity({
                "calendar_events": [],
                "completed_tasks": [],
                "planned_tasks": [],
                "focus_blocks": [],
                "daily_brief": None,
                "notes": None,
                "assistant_activity": [],
                "integration_activity": [],
            })
        return {
            "date": target_date,
            "day_type": _day_type(target_date),
            **classification,
        }

    def get_month(self, year: int, month: int) -> list[dict[str, Any]]:
        _, days_in_month = calendar_lib.monthrange(year, month)
        start = date(year, month, 1)
        end = date(year, month, days_in_month)
        rows = self.get_range(start, end)
        by_date = {row.history_date: row for row in rows}
        return [
            self.build_day_summary(date(year, month, day), by_date.get(date(year, month, day)))
            for day in range(1, days_in_month + 1)
        ]
