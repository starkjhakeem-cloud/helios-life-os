import uuid
from datetime import date, datetime, timedelta, timezone

import pytest


def _now_date() -> date:
    return datetime.now(timezone.utc).date()


@pytest.fixture
def brief_user(db):
    from app.core.jwt import create_access_token
    from app.core.security import hash_password
    from app.models.user import User

    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        name="Brief User",
        email=f"brief-{user_id}@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    return create_access_token(user_id), user_id


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _event(db, user_id: str, title: str, target: date, hour: int = 14):
    from app.models.calendar import CalendarEvent

    start = datetime(target.year, target.month, target.day, hour, 0, tzinfo=timezone.utc)
    end = start + timedelta(hours=1)
    row = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="Calendar snippet",
        start_time=start.isoformat(),
        end_time=end.isoformat(),
        source="google",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    return row


def _email(db, user_id: str, subject: str, *, snippet: str = "Important snippet"):
    from app.models.email import EmailMessage

    row = EmailMessage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        sender="sender@example.com",
        subject=subject,
        snippet=snippet,
        received_at=datetime.now(timezone.utc).isoformat(),
        importance="high",
        status="unread",
        source="gmail",
        external_message_id=str(uuid.uuid4()),
        labels=["INBOX", "IMPORTANT"],
        raw_metadata={"body": "SECRET FULL EMAIL BODY SHOULD NOT LEAK"},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    return row


def _task(db, user_id: str, title: str, target: date, *, overdue: bool = False, goal_id: str | None = None):
    from app.models.task import Task

    due = target - timedelta(days=1) if overdue else target
    row = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="Task details",
        status="todo",
        priority="high",
        due_date=due.isoformat(),
        linked_goal_id=goal_id,
        estimated_duration_minutes=45,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    return row


def _goal(db, user_id: str, title: str):
    from app.models.goal import Goal

    row = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="Goal details",
        status="active",
        priority="high",
        target_date=(_now_date() + timedelta(days=14)).isoformat(),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    return row


def test_daily_brief_generation_with_calendar_gmail_tasks_and_goals(client, db, brief_user, monkeypatch):
    from app.ai.types import AIProviderResponse
    from app.services import daily_brief_service

    token, user_id = brief_user
    target = _now_date()
    goal = _goal(db, user_id, "Launch HELIOS")
    _event(db, user_id, "D278 study block", target)
    _email(db, user_id, "Review enrollment update")
    _task(db, user_id, "Complete D278 quiz", target, goal_id=goal.id)
    _task(db, user_id, "Overdue admin task", target, overdue=True)
    db.commit()

    class FakeAI:
        def generate_json(self, *args, **kwargs):
            return AIProviderResponse(
                provider="mock",
                model="mock",
                content={
                    "summary": "AI summary: study first, then HELIOS.",
                    "compact_text": "AI compact daily brief.",
                    "insights": ["Protect the study block."],
                },
                usage=None,
                finish_reason="stop",
                latency_ms=1,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )

    monkeypatch.setattr(daily_brief_service, "get_ai_provider", lambda: FakeAI())

    response = client.post(
        "/api/v1/daily-brief/generate",
        headers=_auth(token),
        json={"date": target.isoformat()},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == target.isoformat()
    assert body["ai_used"] is True
    assert body["summary"] == "AI summary: study first, then HELIOS."
    assert any(item["title"] == "D278 study block" for item in body["calendar"])
    assert any(item["subject"] == "Review enrollment update" for item in body["email"])
    assert any(item["title"] == "Complete D278 quiz" for item in body["tasks"])
    assert any(item["title"] == "Launch HELIOS" for item in body["goals"])
    assert body["next_best_action"]["title"]


def test_daily_brief_ai_provider_fallback_still_returns_useful_brief(client, db, brief_user, monkeypatch):
    from app.services import daily_brief_service

    token, user_id = brief_user
    target = _now_date()
    _task(db, user_id, "Fallback task", target)
    db.commit()

    class FailingAI:
        def generate_json(self, *args, **kwargs):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(daily_brief_service, "get_ai_provider", lambda: FailingAI())

    response = client.post(
        "/api/v1/daily-brief/generate",
        headers=_auth(token),
        json={"date": target.isoformat()},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ai_used"] is False
    assert body["ai_error"]
    assert "Fallback task" in str(body)


def test_daily_brief_missing_integrations_returns_empty_state(client, brief_user):
    token, _user_id = brief_user

    response = client.post("/api/v1/daily-brief/generate", headers=_auth(token), json={})

    assert response.status_code == 200
    body = response.json()
    assert body["calendar"] == []
    assert body["email"] == []
    assert "open" in body["summary"].lower() or "found 0" in body["compact_text"].lower()


def test_daily_brief_stores_and_retrieves_today_and_historical(client, db, brief_user):
    from app.models.daily_history import DailyHistory

    token, user_id = brief_user
    target = _now_date() - timedelta(days=2)
    _event(db, user_id, "Historical event", target)
    db.commit()

    generated = client.post(
        "/api/v1/daily-brief/generate",
        headers=_auth(token),
        json={"date": target.isoformat()},
    )
    assert generated.status_code == 200

    history = db.query(DailyHistory).filter_by(user_id=user_id, history_date=target).one()
    assert history.daily_brief["date"] == target.isoformat()

    retrieved = client.get(f"/api/v1/daily-brief/{target.isoformat()}", headers=_auth(token))
    assert retrieved.status_code == 200
    assert retrieved.json()["date"] == target.isoformat()

    today = client.get("/api/v1/daily-brief/today", headers=_auth(token))
    assert today.status_code == 200
    assert today.json()["date"] == _now_date().isoformat()


def test_daily_brief_user_scoping_and_no_raw_email_body_leak(client, db, brief_user):
    from app.core.security import hash_password
    from app.models.user import User

    token, user_id = brief_user
    other_id = str(uuid.uuid4())
    db.add(User(
        id=other_id,
        name="Other User",
        email=f"other-{other_id}@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=datetime.now(timezone.utc),
    ))
    target = _now_date()
    _event(db, other_id, "Other user's private event", target)
    _email(db, user_id, "Safe subject", snippet="Safe snippet")
    db.commit()

    response = client.post(
        "/api/v1/daily-brief/generate",
        headers=_auth(token),
        json={"date": target.isoformat()},
    )

    assert response.status_code == 200
    payload_text = str(response.json())
    assert "Other user's private event" not in payload_text
    assert "SECRET FULL EMAIL BODY SHOULD NOT LEAK" not in payload_text
    assert "Safe snippet" in payload_text

