from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.tasks import TaskOut

SuggestionStatus = Literal["pending", "accepted", "rejected"]


class TaskSuggestionOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str | None
    status: str
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
    accepted_task_id: str | None
    rejected_reason: str | None
    created_at: str
    updated_at: str
    accepted_at: str | None = None
    rejected_at: str | None = None

    model_config = {"from_attributes": True}


class SuggestedTasksResponse(BaseModel):
    suggestions: list[TaskSuggestionOut]
    next_best_action: dict[str, Any] = Field(default_factory=dict)
    generated: int = 0


class GenerateTaskSuggestionsRequest(BaseModel):
    sources: list[str] | None = Field(
        default=None,
        description="Optional source filter: gmail, calendar, goals, daily_brief, assistant_context, next_best_action.",
    )
    limit: int = Field(default=20, ge=1, le=100)


class AcceptSuggestionRequest(BaseModel):
    schedule: bool = False
    schedule_date: str | None = Field(default=None, description="YYYY-MM-DD. Defaults to today for auto scheduling.")
    start_time: str | None = None
    end_time: str | None = None


class AcceptSuggestionResponse(BaseModel):
    suggestion: TaskSuggestionOut
    task: TaskOut
    calendar_event: dict[str, Any] | None = None
    goal_progress: dict[str, Any] | None = None


class RejectSuggestionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class ScheduleTaskEngineRequest(BaseModel):
    date: str | None = Field(default=None, description="YYYY-MM-DD. Used for auto scheduling.")
    start_time: str | None = None
    end_time: str | None = None


class ScheduleTaskEngineResponse(BaseModel):
    task: TaskOut
    calendar_event: dict[str, Any]
    selected_window: dict[str, Any] | None = None


class CompleteTaskResponse(BaseModel):
    task: TaskOut
    daily_history_updated: bool
    goal_progress: dict[str, Any] | None = None
