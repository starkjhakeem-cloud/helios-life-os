from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.jwt import create_access_token
from app.core.security import hash_password
from app.models.calendar import CalendarEvent
from app.models.goal import Goal
from app.models.integration import UserIntegration
from app.models.task import Task
from app.models.user import User
from app.models.user_preferences import UserPreferences
from app.models.user_profile import UserProfile
from app.services.awareness_engine import RealTimeAwarenessEngine
from app.services.priority_engine import PriorityEngine


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_user(db: Session) -> tuple[str, User]:
    user = User(
        id=str(uuid.uuid4()),
        name="Awareness User",
        email=f"awareness-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=_now(),
    )
    db.add(user)
    db.flush()
    return create_access_token(user.id), user


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _profile(db: Session, user_id: str, *, timezone_name: str = "America/New_York") -> UserProfile:
    profile = UserProfile(
        user_id=user_id,
        first_name="Tony",
        display_name="Mr. Stark",
        city="Seattle",
        state="WA",
        country="US",
        timezone=timezone_name,
        updated_at=_now(),
    )
    db.add(profile)
    return profile


def _prefs(db: Session, user_id: str) -> UserPreferences:
    prefs = UserPreferences(
        user_id=user_id,
        location="Seattle, WA",
        primary_location="Seattle, WA",
        work_focus="WGU coursework",
        daily_brief_time="08:00",
        updated_at=_now(),
    )
    db.add(prefs)
    return prefs


def _event(db: Session, user_id: str, *, title: str, start: datetime, end: datetime) -> CalendarEvent:
    event = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        start_time=start.isoformat(),
        end_time=end.isoformat(),
        source="google",
        event_type="event",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(event)
    return event


def _task(
    db: Session,
    user_id: str,
    *,
    title: str,
    due_date: str | None = None,
    priority: str = "medium",
    status: str = "todo",
) -> Task:
    task = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        status=status,
        priority=priority,
        due_date=due_date,
        estimated_duration_minutes=45,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(task)
    return task


def _goal(db: Session, user_id: str, *, title: str = "Finish WGU term") -> Goal:
    goal = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        status="active",
        priority="high",
        target_date=(date(2026, 7, 3) + timedelta(days=3)).isoformat(),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(goal)
    return goal


def _integration(db: Session, user_id: str, *, service_type: str) -> UserIntegration:
    row = UserIntegration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider="google",
        service_type=service_type,
        status="connected",
        connected_at=_now(),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(row)
    return row


def test_real_time_awareness_engine_builds_unified_context(db: Session):
    _token, user = _make_user(db)
    _profile(db, user.id)
    _prefs(db, user.id)
    target = date(2026, 7, 3)
    now = datetime(2026, 7, 3, 13, 0, tzinfo=timezone.utc)
    _event(
        db,
        user.id,
        title="Design review",
        start=datetime(2026, 7, 3, 15, 0, tzinfo=timezone.utc),
        end=datetime(2026, 7, 3, 16, 0, tzinfo=timezone.utc),
    )
    _task(db, user.id, title="Overdue work", due_date="2026-07-02", priority="high")
    _task(db, user.id, title="Due today", due_date="2026-07-03", priority="medium")
    _goal(db, user.id)
    _integration(db, user.id, service_type="gmail")
    _integration(db, user.id, service_type="calendar")
    db.commit()

    context = RealTimeAwarenessEngine(db, now=now).build_context(user.id, target)

    assert context["localDate"] == "2026-07-03"
    assert context["localTime"] == "09:00:00"
    assert context["dayPeriod"] == "morning"
    assert context["weather"]["condition"] == "rain"
    assert context["calendar"]["nextEvent"]["title"] == "Design review"
    assert context["calendar"]["availableMinutes"] == 120
    assert context["tasks"]["overdue"] == 1
    assert context["tasks"]["dueToday"] == 1
    assert context["goals"]["activeCount"] == 1
    assert context["goals"]["goalsWithoutTasks"] == 1
    assert context["integrations"]["gmail"] is True
    assert context["integrations"]["googleCalendar"] is True


def test_awareness_endpoint_returns_current_context(client, db: Session):
    token, user = _make_user(db)
    _profile(db, user.id)
    _prefs(db, user.id)
    db.commit()

    response = client.get("/api/v1/awareness/current", headers=_auth(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["timezone"] == "America/New_York"
    assert body["weather"]["condition"]
    assert body["calendar"]["busy"] is False
    assert body["network"]["online"] is True


def test_assistant_context_includes_real_time_awareness(db: Session):
    from app.ai.assistant_context_service import AssistantContextService

    _token, user = _make_user(db)
    _profile(db, user.id)
    _prefs(db, user.id)
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(user.id, "What time is it?", context_type="general")
    prompt = svc.summarize_context_for_prompt(ctx)

    assert ctx["real_time_awareness"]["localTime"]
    assert "REAL-TIME AWARENESS:" in prompt
    assert "LOCAL:" in prompt
    assert "WEATHER:" in prompt


def test_priority_recommendations_adapt_to_evening_awareness(db: Session):
    _token, user = _make_user(db)
    _profile(db, user.id, timezone_name="UTC")
    _prefs(db, user.id)
    _task(db, user.id, title="Optional admin", priority="low", due_date="2026-07-05")
    db.commit()

    context = PriorityEngine(
        db,
        now=datetime(2026, 7, 3, 18, 30, tzinfo=timezone.utc),
    ).build_priority_context(user.id, date(2026, 7, 3))

    awareness_items = [
        item for item in context["recommendations"]
        if item.get("source_type") == "real_time_awareness"
    ]
    assert awareness_items
    assert awareness_items[0]["title"] == "Plan tomorrow before you shut down"
    assert context["awareness"]["dayPeriod"] == "evening"


def test_daily_brief_consumes_awareness(client, db: Session):
    token, user = _make_user(db)
    _profile(db, user.id)
    _prefs(db, user.id)
    db.commit()

    response = client.get("/api/v1/daily-brief/today", headers=_auth(token))

    assert response.status_code == 200, response.text
    body = response.json()
    assert "real_time_awareness" in body["data_sources"]
    assert body["greeting"].startswith("Good ")
    assert any("Current context:" in insight for insight in body["insights"])
