from typing import Literal

from pydantic import BaseModel, Field

ThemePreference = Literal["system", "dark", "light"]
AssistantTone = Literal["balanced", "formal", "casual", "brief"]
TimeFormat = Literal["12h", "24h"]

VALID_LIFE_AREAS = {
    "school", "work", "family", "health", "finances",
    "creative_projects", "fitness", "business",
}


class PreferencesOut(BaseModel):
    user_id: str
    theme_preference: ThemePreference
    notifications_enabled: bool
    reminder_notifications: bool
    ai_notifications: bool
    default_planning_horizon: int
    location: str
    # Personalization
    preferred_name: str | None
    assistant_tone: AssistantTone
    primary_location: str | None
    work_focus: str | None
    daily_brief_time: str
    time_format: TimeFormat
    important_life_areas: list[str]
    updated_at: str

    model_config = {"from_attributes": True}


class PreferencesUpdate(BaseModel):
    theme_preference: ThemePreference | None = None
    notifications_enabled: bool | None = None
    reminder_notifications: bool | None = None
    ai_notifications: bool | None = None
    default_planning_horizon: int | None = Field(default=None, ge=1, le=90)
    location: str | None = Field(default=None, min_length=1, max_length=120)
    # Personalization
    preferred_name: str | None = Field(default=None, max_length=100)
    assistant_tone: AssistantTone | None = None
    primary_location: str | None = Field(default=None, max_length=120)
    work_focus: str | None = Field(default=None, max_length=200)
    daily_brief_time: str | None = Field(default=None, max_length=5)
    time_format: TimeFormat | None = None
    important_life_areas: list[str] | None = None
