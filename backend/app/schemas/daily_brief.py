from __future__ import annotations

from datetime import date as date_type
from typing import Any

from pydantic import BaseModel, Field


class DailyBriefOut(BaseModel):
    date: date_type
    title: str = "Daily Brief"
    greeting: str
    summary: str
    compact_text: str
    calendar: list[dict[str, Any]] = Field(default_factory=list)
    email: list[dict[str, Any]] = Field(default_factory=list)
    tasks: list[dict[str, Any]] = Field(default_factory=list)
    goals: list[dict[str, Any]] = Field(default_factory=list)
    next_best_action: dict[str, Any] = Field(default_factory=dict)
    focus_recommendation: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)
    generated_at: str
    data_sources: list[str] = Field(default_factory=list)
    ai_used: bool = False
    ai_error: str | None = None


class DailyBriefGenerateRequest(BaseModel):
    date: date_type | None = None
    regenerate: bool = True
