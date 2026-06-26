from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

DayType = Literal["past", "today", "future"]
DayStatus = Literal["open", "locked", "planned"]
ActivityLevel = Literal["low", "medium", "high"]


class DailyHistoryGenerateRequest(BaseModel):
    timezone: str = Field(default="UTC", max_length=100)
    regenerate: bool = Field(
        default=False,
        description="When true, regenerate an existing past or locked day from current source data.",
    )
    summary: str | None = Field(default=None, max_length=12000)
    daily_brief: dict[str, Any] | None = None
    focus_blocks: list[dict[str, Any]] | None = None
    assistant_activity: list[dict[str, Any]] | None = None
    integration_activity: list[dict[str, Any]] | None = None
    notes: str | None = Field(default=None, max_length=12000)
    metadata: dict[str, Any] | None = None


class DailyHistoryNotesUpdate(BaseModel):
    notes: str | None = Field(default=None, max_length=12000)
    metadata: dict[str, Any] | None = None


class DailyHistoryOut(BaseModel):
    id: str
    user_id: str
    date: date
    timezone: str
    day_type: str
    status: str
    summary: str | None
    daily_brief: dict[str, Any] | None
    completed_tasks: list[dict[str, Any]]
    planned_tasks: list[dict[str, Any]]
    overdue_tasks: list[dict[str, Any]]
    goals_snapshot: list[dict[str, Any]]
    calendar_events: list[dict[str, Any]]
    focus_blocks: list[dict[str, Any]]
    assistant_activity: list[dict[str, Any]]
    integration_activity: list[dict[str, Any]]
    notes: str | None
    metadata: dict[str, Any] | None
    created_at: str
    updated_at: str
    locked_at: str | None


class DailyHistoryRangeResponse(BaseModel):
    days: list[DailyHistoryOut]
    total: int


class DailyHistoryDaySummary(BaseModel):
    date: date
    day_type: str
    has_events: bool
    has_tasks: bool
    has_focus: bool
    has_personal: bool
    activity_level: ActivityLevel
    event_count: int
    completed_task_count: int
    planned_task_count: int
    focus_minutes: int
    brief_available: bool
    notes_available: bool


class DailyHistoryMonthResponse(BaseModel):
    year: int
    month: int
    days: list[DailyHistoryDaySummary]
    total: int
