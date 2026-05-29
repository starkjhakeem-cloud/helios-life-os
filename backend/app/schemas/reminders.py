from pydantic import BaseModel, Field


class ReminderCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=500)
    remind_at: str = Field(..., min_length=1)   # ISO 8601 datetime string
    is_enabled: bool = True
    task_id: str | None = None
    goal_id: str | None = None


class ReminderUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = None
    remind_at: str | None = None
    is_enabled: bool | None = None


class ReminderOut(BaseModel):
    id: str
    user_id: str
    title: str
    body: str | None
    remind_at: str
    is_enabled: bool
    task_id: str | None
    goal_id: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class RemindersResponse(BaseModel):
    reminders: list[ReminderOut]
