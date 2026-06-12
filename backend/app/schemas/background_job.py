from __future__ import annotations
from typing import Literal

from pydantic import BaseModel, Field

JobType = Literal[
    "daily_briefing_generation",
    "proactive_suggestion_scan",
    "reminder_check",
    "integration_sync_simulation",
]

JobStatus = Literal["idle", "running", "failed"]


class BackgroundJobCreate(BaseModel):
    job_type: JobType
    schedule_label: str = Field(..., min_length=1, max_length=100)
    enabled: bool = True


class BackgroundJobUpdate(BaseModel):
    enabled: bool | None = None
    schedule_label: str | None = Field(default=None, min_length=1, max_length=100)


class BackgroundJobOut(BaseModel):
    id: str
    user_id: str
    job_type: str
    status: str
    schedule_label: str
    last_run_at: str | None
    next_run_at: str | None
    enabled: bool
    created_at: str

    model_config = {"from_attributes": True}


class BackgroundJobListResponse(BaseModel):
    jobs: list[BackgroundJobOut]
    total: int


class BackgroundJobTriggerResult(BaseModel):
    job_id: str
    job_type: str
    triggered_at: str
    result_summary: str
    items_created: int
