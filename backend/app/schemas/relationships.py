"""Pydantic schemas for the Task/Goal/Calendar relationship layer."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ── FocusBlock ─────────────────────────────────────────────────────────────────

FocusBlockStatus = Literal["planned", "in_progress", "completed", "cancelled"]
FocusBlockSource = Literal["manual", "ai_suggested", "calendar_sync"]


class FocusBlockCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    start_time: str = Field(..., description="ISO 8601 datetime string")
    end_time: str = Field(..., description="ISO 8601 datetime string")
    linked_goal_id: str | None = None
    task_ids: list[str] = Field(default_factory=list)
    source: FocusBlockSource = "manual"
    notes: str | None = None


class FocusBlockOut(BaseModel):
    id: str
    user_id: str
    title: str
    start_time: str
    end_time: str
    linked_goal_id: str | None
    linked_task_ids: list[str]
    status: str
    source: str
    notes: str | None
    actual_start: str | None = None
    actual_end: str | None = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class FocusBlockStatusUpdate(BaseModel):
    status: FocusBlockStatus


# ── Relationship mutations ──────────────────────────────────────────────────────

class LinkGoalRequest(BaseModel):
    goal_id: str
    category: str | None = Field(default=None, max_length=100)


class ScheduleTaskRequest(BaseModel):
    start_time: str = Field(..., description="ISO 8601 datetime string")
    end_time: str = Field(..., description="ISO 8601 datetime string")


class AssignTasksRequest(BaseModel):
    task_ids: list[str] = Field(..., min_length=1)


# ── Task (extended output) ─────────────────────────────────────────────────────

class TaskRelationshipOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str | None
    status: str
    priority: str
    due_date: str | None
    linked_goal_id: str | None
    estimated_duration_minutes: int | None
    category: str | None
    scheduled_start: str | None
    scheduled_end: str | None
    focus_block_id: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


# ── CalendarEvent (extended output) ───────────────────────────────────────────

class CalendarEventOut(BaseModel):
    id: str
    user_id: str
    title: str
    start_time: str
    end_time: str
    location: str | None
    source: str
    event_type: str | None
    linked_goal_id: str | None
    linked_task_id: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


# ── Schedule task response ─────────────────────────────────────────────────────

class ScheduleTaskResponse(BaseModel):
    task: TaskRelationshipOut
    calendar_event: CalendarEventOut


# ── Next Best Action ───────────────────────────────────────────────────────────

class NextBestActionResponse(BaseModel):
    type: Literal["task", "focus_block", "goal", "calendar", "none"]
    title: str
    reason: str
    estimated_duration_minutes: int | None
    linked_goal_id: str | None
    linked_task_id: str | None
    suggested_start_time: str | None
    confidence: float


# ── Available time windows ─────────────────────────────────────────────────────

class TimeWindow(BaseModel):
    start_time: str
    end_time: str
    duration_minutes: int
    suggested_use: str
    confidence: float


# ── Goal progress ──────────────────────────────────────────────────────────────

class GoalProgressResponse(BaseModel):
    goal_id: str
    goal_title: str
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    todo_tasks: int
    computed_progress: float   # 0.0–1.0, derived from task completion
    manual_progress: float | None  # explicitly set; None = not overridden
    effective_progress: float  # manual_progress if set, else computed_progress


# ── Relationship health ────────────────────────────────────────────────────────

class HealthItem(BaseModel):
    id: str
    title: str
    detail: str | None = None


class RelationshipHealthResponse(BaseModel):
    goals_without_tasks: list[HealthItem]
    high_priority_tasks_without_goals: list[HealthItem]
    goals_without_scheduled_time: list[HealthItem]
    unscheduled_overdue_tasks: list[HealthItem]
    calendar_conflicts: list[dict[str, Any]]
    summary: dict[str, int]


# ── Error ──────────────────────────────────────────────────────────────────────

class RelationshipError(BaseModel):
    error: str
    detail: str | None = None
