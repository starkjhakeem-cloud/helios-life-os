import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.models.user_preferences import UserPreferences
from app.schemas.settings import PreferencesOut, PreferencesUpdate, VALID_LIFE_AREAS

VALID_ASSISTANT_NAME_PREFERENCES = {"display_name", "preferred_name", "first_name"}

router = APIRouter()

_DEFAULTS = {
    "theme_preference": "system",
    "notifications_enabled": True,
    "reminder_notifications": True,
    "ai_notifications": False,
    "default_planning_horizon": 7,
    "location": "New York",
    "preferred_name": None,
    "assistant_name_preference": "display_name",
    "assistant_tone": "balanced",
    "primary_location": None,
    "work_focus": None,
    "daily_brief_time": "08:00",
    "time_format": "12h",
    "important_life_areas": None,
}


def _get_or_create(db: Session, user_id: str) -> UserPreferences:
    """Return existing preferences row, or insert defaults and return them."""
    prefs = db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    ).scalar_one_or_none()

    if prefs is None:
        prefs = UserPreferences(
            user_id=user_id,
            updated_at=datetime.now(timezone.utc),
            **_DEFAULTS,
        )
        db.add(prefs)
        db.commit()
        db.refresh(prefs)

    return prefs


def _to_out(p: UserPreferences) -> PreferencesOut:
    raw_areas = p.important_life_areas
    try:
        areas: list[str] = json.loads(raw_areas) if raw_areas else []
    except (ValueError, TypeError):
        areas = []

    return PreferencesOut(
        user_id=p.user_id,
        theme_preference=p.theme_preference,  # type: ignore[arg-type]
        notifications_enabled=p.notifications_enabled,
        reminder_notifications=p.reminder_notifications,
        ai_notifications=p.ai_notifications,
        default_planning_horizon=p.default_planning_horizon,
        location=p.location,
        preferred_name=p.preferred_name,
        assistant_name_preference=p.assistant_name_preference or "display_name",
        assistant_tone=p.assistant_tone,  # type: ignore[arg-type]
        primary_location=p.primary_location,
        work_focus=p.work_focus,
        daily_brief_time=p.daily_brief_time,
        time_format=p.time_format,  # type: ignore[arg-type]
        important_life_areas=areas,
        updated_at=p.updated_at.isoformat(),
    )


@router.get("/preferences", response_model=PreferencesOut)
def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PreferencesOut:
    """Return the current user's preferences, creating defaults on first call."""
    return _to_out(_get_or_create(db, current_user.id))


@router.patch("/preferences", response_model=PreferencesOut)
def update_preferences(
    payload: PreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PreferencesOut:
    """Partially update preferences. Only supplied fields are changed."""
    prefs = _get_or_create(db, current_user.id)

    if payload.theme_preference is not None:
        prefs.theme_preference = payload.theme_preference
    if payload.notifications_enabled is not None:
        prefs.notifications_enabled = payload.notifications_enabled
    if payload.reminder_notifications is not None:
        prefs.reminder_notifications = payload.reminder_notifications
    if payload.ai_notifications is not None:
        prefs.ai_notifications = payload.ai_notifications
    if payload.default_planning_horizon is not None:
        prefs.default_planning_horizon = payload.default_planning_horizon
    if payload.location is not None:
        prefs.location = payload.location.strip() or "New York"
    if "preferred_name" in payload.model_fields_set:
        prefs.preferred_name = payload.preferred_name
    if payload.assistant_name_preference is not None:
        if payload.assistant_name_preference in VALID_ASSISTANT_NAME_PREFERENCES:
            prefs.assistant_name_preference = payload.assistant_name_preference
    if payload.assistant_tone is not None:
        prefs.assistant_tone = payload.assistant_tone
    if "primary_location" in payload.model_fields_set:
        prefs.primary_location = payload.primary_location
    if "work_focus" in payload.model_fields_set:
        prefs.work_focus = payload.work_focus
    if payload.daily_brief_time is not None:
        prefs.daily_brief_time = payload.daily_brief_time
    if payload.time_format is not None:
        prefs.time_format = payload.time_format
    if payload.important_life_areas is not None:
        valid = [a for a in payload.important_life_areas if a in VALID_LIFE_AREAS]
        prefs.important_life_areas = json.dumps(valid)

    prefs.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(prefs)
    return _to_out(prefs)
