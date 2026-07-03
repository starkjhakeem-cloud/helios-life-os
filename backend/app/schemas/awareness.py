from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


DayPeriod = Literal["morning", "afternoon", "evening", "night"]


class AwarenessWeather(BaseModel):
    condition: str
    temperature: int | float | None = None
    precipitationChance: int | float | None = None
    source: str
    locationLabel: str | None = None
    providerReady: bool = True


class AwarenessLocation(BaseModel):
    city: str | None = None
    state: str | None = None
    country: str | None = None
    label: str | None = None
    source: str


class AwarenessCalendar(BaseModel):
    currentEvent: dict[str, Any] | None = None
    nextEvent: dict[str, Any] | None = None
    busy: bool
    availableMinutes: int
    freeWindows: list[dict[str, Any]] = Field(default_factory=list)
    eventCountToday: int = 0


class AwarenessGoals(BaseModel):
    activeCount: int
    urgentCount: int
    goalsWithoutTasks: int = 0
    stalledCount: int = 0
    highestPriorityGoal: dict[str, Any] | None = None


class AwarenessTasks(BaseModel):
    dueToday: int
    overdue: int
    remaining: int
    completedToday: int = 0
    estimatedWorkMinutes: int = 0
    currentTask: dict[str, Any] | None = None
    highestPriorityTask: dict[str, Any] | None = None


class AwarenessIntegrations(BaseModel):
    gmail: bool
    googleCalendar: bool
    connectedCount: int = 0
    needsAttentionCount: int = 0


class AwarenessBattery(BaseModel):
    level: int | float | None = None
    charging: bool | None = None
    source: str


class AwarenessNetwork(BaseModel):
    online: bool
    status: str
    source: str


class RealTimeContext(BaseModel):
    now: str
    localTime: str
    localDate: str
    timezone: str
    dayOfWeek: str
    month: str
    year: int
    dayPeriod: DayPeriod
    isWeekend: bool
    sunrise: str | None = None
    sunset: str | None = None
    weather: AwarenessWeather | None = None
    location: AwarenessLocation | None = None
    calendar: AwarenessCalendar
    goals: AwarenessGoals
    tasks: AwarenessTasks
    integrations: AwarenessIntegrations
    connectedServices: list[dict[str, Any]] = Field(default_factory=list)
    battery: AwarenessBattery | None = None
    network: AwarenessNetwork
    profile: dict[str, Any] = Field(default_factory=dict)
    generatedAt: str
    cacheTtlSeconds: int
    source: str
