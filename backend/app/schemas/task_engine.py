from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.tasks import TaskOut

SuggestionStatus = Literal["pending", "accepted", "rejected"]
RecommendationType = Literal["goal", "task", "calendar", "email", "planning", "recovery", "assistant", "none"]
RecommendationUrgency = Literal["low", "medium", "high", "critical"]
RecommendationImpact = Literal["low", "medium", "high"]
BuildDayBlockType = Literal["calendar", "task", "goal", "email", "break", "focus", "planning"]


class HeliosRecommendationSourceIds(BaseModel):
    goalId: str | None = None
    taskId: str | None = None
    eventId: str | None = None
    emailId: str | None = None


class HeliosRecommendationAction(BaseModel):
    label: str
    route: str | None = None
    operation: str | None = None


class HeliosRecommendation(BaseModel):
    id: str
    type: RecommendationType
    title: str
    description: str
    score: float
    reason: str
    urgency: RecommendationUrgency
    impact: RecommendationImpact
    effortMinutes: int | None = None
    sourceIds: HeliosRecommendationSourceIds = Field(default_factory=HeliosRecommendationSourceIds)
    action: HeliosRecommendationAction

    # Backward-compatible fields used by current API consumers.
    confidence: float | None = None
    priority: str | None = None
    due_date: str | None = None
    estimated_duration_minutes: int | None = None
    linked_goal_id: str | None = None
    linked_task_id: str | None = None
    suggested_start_time: str | None = None
    source_type: str | None = None
    source_id: str | None = None
    metadata: dict[str, Any] | None = None


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
    recommendations: list[HeliosRecommendation] = Field(default_factory=list)
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


class BuildDayRequest(BaseModel):
    date: str | None = Field(default=None, description="YYYY-MM-DD. Defaults to today.")
    commit: bool = Field(default=True, description="When true, schedule selected tasks into calendar blocks.")
    max_items: int = Field(default=8, ge=1, le=20)


class BuildDayScheduleBlock(BaseModel):
    id: str
    title: str
    startTime: str | None = None
    endTime: str | None = None
    type: BuildDayBlockType
    sourceId: str | None = None
    reason: str
    priority: RecommendationUrgency


class BuildDayTopTask(BaseModel):
    id: str | None = None
    title: str
    reason: str
    estimatedMinutes: int | None = None


class BuildDayResponse(BaseModel):
    date: str
    generated_at: str
    committed: bool
    summary: str
    primaryFocus: str
    scheduleBlocks: list[BuildDayScheduleBlock] = Field(default_factory=list)
    topTasks: list[BuildDayTopTask] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    awareness: dict[str, Any] = Field(default_factory=dict)
    scheduled_items: list[dict[str, Any]]
    unscheduled_actions: list[dict[str, Any]]
    windows_remaining: list[dict[str, Any]]
    next_best_action: dict[str, Any]
    recommendations: list[HeliosRecommendation] = Field(default_factory=list)
    filtered_email_count: int = 0


class CompleteTaskResponse(BaseModel):
    task: TaskOut
    daily_history_updated: bool
    goal_progress: dict[str, Any] | None = None
