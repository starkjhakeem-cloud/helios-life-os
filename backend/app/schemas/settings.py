from typing import Literal

from pydantic import BaseModel, Field

ThemePreference = Literal["system", "dark", "light"]


class PreferencesOut(BaseModel):
    user_id: str
    theme_preference: ThemePreference
    notifications_enabled: bool
    reminder_notifications: bool
    ai_notifications: bool
    default_planning_horizon: int
    updated_at: str

    model_config = {"from_attributes": True}


class PreferencesUpdate(BaseModel):
    theme_preference: ThemePreference | None = None
    notifications_enabled: bool | None = None
    reminder_notifications: bool | None = None
    ai_notifications: bool | None = None
    default_planning_horizon: int | None = Field(default=None, ge=1, le=90)
