from datetime import date
from typing import Any

from pydantic import BaseModel, Field


class DailySnapshotUpsert(BaseModel):
    snapshot_date: date
    tasks_completed: list[dict[str, Any]] | None = None
    tasks_planned: list[dict[str, Any]] | None = None
    overdue_tasks: list[dict[str, Any]] | None = None
    active_goals: list[dict[str, Any]] | None = None
    goal_progress: list[dict[str, Any]] | None = None
    calendar_events: list[dict[str, Any]] | None = None
    focus_blocks: list[dict[str, Any]] | None = None
    daily_brief: dict[str, Any] | None = None
    assistant_activity: list[dict[str, Any]] | None = None
    connected_service_sync: dict[str, Any] | None = None
    notes: str | None = Field(default=None, max_length=12000)


class DailySnapshotGenerate(BaseModel):
    snapshot_date: date
    regenerate: bool = Field(
        default=False,
        description="When false, an existing snapshot is returned unchanged. When true, it is refreshed from current source data.",
    )
    daily_brief: dict[str, Any] | None = None
    assistant_activity: list[dict[str, Any]] | None = None
    connected_service_sync: dict[str, Any] | None = None
    notes: str | None = Field(default=None, max_length=12000)


class DailySnapshotOut(BaseModel):
    id: str
    user_id: str
    snapshot_date: date
    generated_at: str
    tasks_completed: list[dict[str, Any]]
    tasks_planned: list[dict[str, Any]]
    overdue_tasks: list[dict[str, Any]]
    active_goals: list[dict[str, Any]]
    goal_progress: list[dict[str, Any]]
    calendar_events: list[dict[str, Any]]
    focus_blocks: list[dict[str, Any]]
    daily_brief: dict[str, Any] | None
    assistant_activity: list[dict[str, Any]]
    connected_service_sync: dict[str, Any] | None
    notes: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class DailySnapshotRangeResponse(BaseModel):
    snapshots: list[DailySnapshotOut]
    total: int
