from typing import Literal

from pydantic import BaseModel, Field

TaskStatus = Literal["todo", "in_progress", "done"]
TaskPriority = Literal["low", "medium", "high", "critical"]


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    due_date: str | None = None
    linked_goal_id: str | None = None
    estimated_duration_minutes: int | None = None
    category: str | None = Field(default=None, max_length=100)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_date: str | None = None
    linked_goal_id: str | None = None
    estimated_duration_minutes: int | None = None
    category: str | None = Field(default=None, max_length=100)


class TaskOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str | None
    status: str
    priority: str
    due_date: str | None
    linked_goal_id: str | None
    estimated_duration_minutes: int | None = None
    category: str | None = None
    scheduled_start: str | None = None
    scheduled_end: str | None = None
    focus_block_id: str | None = None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class TasksResponse(BaseModel):
    tasks: list[TaskOut]
