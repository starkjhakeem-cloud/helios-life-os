from typing import Literal

from pydantic import BaseModel, Field

# Valid sources now; extend this Literal when external providers are added.
EventSource = Literal["manual", "google", "outlook", "ical"]


class CalendarEventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    # ISO 8601 with timezone, e.g. "2026-06-11T10:00:00Z"
    start_time: str = Field(..., min_length=1, max_length=50)
    end_time: str = Field(..., min_length=1, max_length=50)
    location: str | None = Field(default=None, max_length=300)
    source: EventSource = "manual"
    external_event_id: str | None = None


class CalendarEventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    start_time: str | None = Field(default=None, min_length=1, max_length=50)
    end_time: str | None = Field(default=None, min_length=1, max_length=50)
    location: str | None = Field(default=None, max_length=300)
    source: EventSource | None = None
    external_event_id: str | None = None


class CalendarEventOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str | None
    start_time: str
    end_time: str
    location: str | None
    source: str
    external_event_id: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class CalendarEventsResponse(BaseModel):
    events: list[CalendarEventOut]
    total: int
