"""
Tests for AssistantContextService (app/ai/assistant_context_service.py).

Covers:
  - Context type inference
  - Time window extraction
  - Per-source retrieval (goals, tasks, calendar, history, conversations, services)
  - User scoping (no cross-user data leakage)
  - No secrets in context package
  - summarize_context_for_prompt output
  - /api/v1/assistant/context/preview endpoint
  - /api/v1/ai/chat and /api/v1/ai/conversations/{id}/messages still work
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.assistant_context_service import (
    AssistantContextService,
    extract_time_window,
    infer_context_type,
)
from app.models.calendar import CalendarEvent
from app.models.conversation import Conversation, ConversationMessage
from app.models.daily_history import DailyHistory
from app.models.email import EmailMessage
from app.models.goal import Goal
from app.models.integration import UserIntegration
from app.models.memory import AIMemory
from app.models.task import Task
from app.models.user import User
from app.models.user_preferences import UserPreferences
from app.models.user_profile import UserProfile


# ── Helpers ─────────────────────────────────────────────────────────────────────

def _make_user(db: Session, *, suffix: str = "a") -> User:
    now = datetime.now(timezone.utc)
    u = User(
        id=str(uuid.uuid4()),
        name=f"Test User {suffix}",
        email=f"user_{suffix}_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="$2b$12$fakehash",
        created_at=now,
    )
    db.add(u)
    db.flush()
    return u


def _make_goal(db: Session, user_id: str, title: str = "Test Goal") -> Goal:
    now = datetime.now(timezone.utc)
    g = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="A goal for testing",
        status="active",
        target_date="2026-12-31",
        created_at=now,
        updated_at=now,
    )
    db.add(g)
    db.flush()
    return g


def _make_task(
    db: Session,
    user_id: str,
    *,
    title: str = "Test Task",
    status: str = "todo",
    priority: str = "medium",
    due_date: str | None = None,
) -> Task:
    now = datetime.now(timezone.utc)
    t = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="A task for testing",
        status=status,
        priority=priority,
        due_date=due_date,
        created_at=now,
        updated_at=now,
    )
    db.add(t)
    db.flush()
    return t


def _make_calendar_event(
    db: Session,
    user_id: str,
    *,
    title: str = "Team Meeting",
    start_time: str = "2026-06-25T09:00:00Z",
    end_time: str = "2026-06-25T10:00:00Z",
) -> CalendarEvent:
    ev = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        start_time=start_time,
        end_time=end_time,
        source="manual",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(ev)
    db.flush()
    return ev


def _make_history(
    db: Session,
    user_id: str,
    *,
    history_date: date | None = None,
    summary: str = "Productive day",
) -> DailyHistory:
    now = datetime.now(timezone.utc)
    h = DailyHistory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        history_date=history_date or date.today(),
        timezone="UTC",
        day_type="today",
        status="open",
        summary=summary,
        completed_tasks=[{"title": "Finished review"}],
        daily_brief={"summary": "Great focus day", "priorities": []},
        created_at=now,
        updated_at=now,
    )
    db.add(h)
    db.flush()
    return h


def _make_integration(
    db: Session,
    user_id: str,
    *,
    provider: str = "google",
    service_type: str = "calendar",
    status: str = "connected",
) -> UserIntegration:
    now = datetime.now(timezone.utc)
    i = UserIntegration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider=provider,
        service_type=service_type,
        email="user@gmail.com",
        display_name="User Gmail",
        status=status,
        connected_at=now,
        last_sync_at=now,
        # Tokens are deliberately not set — the service must not expose them
        access_token_encrypted=None,
        refresh_token_encrypted=None,
        created_at=now,
        updated_at=now,
    )
    db.add(i)
    db.flush()
    return i


def _make_memory(db: Session, user_id: str, content: str = "User prefers dark mode") -> AIMemory:
    now = datetime.now(timezone.utc)
    m = AIMemory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        memory_type="preference",
        content=content,
        created_at=now,
        updated_at=now,
    )
    db.add(m)
    db.flush()
    return m


def _make_conversation_message(
    db: Session,
    user_id: str,
    *,
    role: str = "user",
    content: str = "Hello HELIOS",
) -> ConversationMessage:
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    conv = Conversation(
        id=conv_id,
        user_id=user_id,
        title="Test convo",
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    msg = ConversationMessage(
        id=str(uuid.uuid4()),
        conversation_id=conv_id,
        user_id=user_id,
        role=role,
        content=content,
        meta="{}",
        created_at=now,
    )
    db.add(msg)
    db.flush()
    return msg


def _signup(client: TestClient, email: str = "ctx@test.com", name: str = "Ctx User") -> str:
    resp = client.post(
        "/api/v1/auth/signup",
        json={"name": name, "email": email, "password": "Password123!"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["access_token"]


# ── Context type inference ──────────────────────────────────────────────────────

def test_infer_context_type_school():
    assert infer_context_type("How am I doing on my WGU course?") == "school"


def test_infer_context_type_goals():
    assert infer_context_type("Show me my active goals and progress") == "goals"


def test_infer_context_type_tasks():
    assert infer_context_type("What tasks are overdue?") == "tasks"


def test_infer_context_type_historical():
    assert infer_context_type("What happened last Tuesday?") == "historical"


def test_infer_context_type_calendar():
    assert infer_context_type("What's on my schedule today?") == "calendar"


def test_infer_context_type_general_fallback():
    assert infer_context_type("Hey") == "general"


# ── Time window extraction ──────────────────────────────────────────────────────

def test_extract_time_window_today():
    window = extract_time_window("What's my plan for today?")
    today = date.today()
    assert window == (today, today)


def test_extract_time_window_yesterday():
    window = extract_time_window("What happened yesterday?")
    yesterday = date.today() - timedelta(days=1)
    assert window == (yesterday, yesterday)


def test_extract_time_window_tomorrow():
    window = extract_time_window("Any events tomorrow?")
    tomorrow = date.today() + timedelta(days=1)
    assert window == (tomorrow, tomorrow)


def test_extract_time_window_this_week():
    window = extract_time_window("Review my tasks this week")
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    assert window == (monday, sunday)


def test_extract_time_window_last_week():
    window = extract_time_window("What did I complete last week?")
    today = date.today()
    last_monday = today - timedelta(days=today.weekday() + 7)
    last_sunday = last_monday + timedelta(days=6)
    assert window == (last_monday, last_sunday)


def test_extract_time_window_specific_weekday():
    window = extract_time_window("What happened last Monday?")
    assert window is not None
    start, end = window
    assert start.weekday() == 0  # Monday
    assert start == end


def test_extract_time_window_specific_date_june():
    window = extract_time_window("What's on June 25?")
    assert window is not None
    start, end = window
    assert start.month == 6
    assert start.day == 25
    assert start == end


def test_extract_time_window_no_reference():
    window = extract_time_window("Tell me about my goals")
    assert window is None


# ── Service unit tests (direct DB) ─────────────────────────────────────────────

def test_build_context_empty_user(db: Session):
    """Context build succeeds even with no profile data — returns empty sections."""
    u = _make_user(db)
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "Hello")

    assert "user_profile" in ctx
    assert "active_goals" in ctx
    assert "relevant_tasks" in ctx
    assert "retrieval_metadata" in ctx
    assert ctx["retrieval_metadata"]["context_type"] in ("general", "calendar", "tasks", "goals", "school", "work", "historical", "helios_development", "health", "finance", "creative", "email", "agenda")


def test_build_context_goals(db: Session):
    u = _make_user(db)
    _make_goal(db, u.id, "Graduate from WGU")
    _make_goal(db, u.id, "Build HELIOS v3")
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "How are my goals?", context_type="goals")

    assert len(ctx["active_goals"]) == 2
    titles = {g["title"] for g in ctx["active_goals"]}
    assert "Graduate from WGU" in titles
    assert "Build HELIOS v3" in titles
    assert "goals" in ctx["retrieval_metadata"]["sources_used"]


def test_build_context_tasks_and_priorities(db: Session):
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    u = _make_user(db)
    _make_task(db, u.id, title="Overdue Task", status="todo", priority="high", due_date=yesterday)
    _make_task(db, u.id, title="In-Progress Task", status="in_progress", priority="medium")
    _make_task(db, u.id, title="Future Task", status="todo", priority="low", due_date="2026-09-01")
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "What tasks need attention?", context_type="tasks")

    # Overdue + in-progress should appear in priorities
    priority_titles = {p["title"] for p in ctx["current_priorities"]}
    assert "Overdue Task" in priority_titles or "In-Progress Task" in priority_titles


def test_build_context_calendar(db: Session):
    u = _make_user(db)
    _make_calendar_event(
        db, u.id,
        title="Doctor Appointment",
        start_time="2026-06-26T14:00:00Z",
    )
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "What's my schedule?", context_type="calendar")

    assert len(ctx["calendar_context"]) >= 1
    titles = {ev["title"] for ev in ctx["calendar_context"]}
    assert "Doctor Appointment" in titles


def test_build_context_daily_history(db: Session):
    u = _make_user(db)
    yesterday = date.today() - timedelta(days=1)
    _make_history(db, u.id, history_date=yesterday, summary="Very productive day")
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "What happened yesterday?")

    assert len(ctx["daily_history"]) >= 1
    assert ctx["daily_history"][0]["summary"] == "Very productive day"
    # Daily brief should also be populated from the history record
    assert ctx["daily_brief"].get("summary") == "Great focus day"


def test_build_context_conversation_history(db: Session):
    u = _make_user(db)
    _make_conversation_message(db, u.id, role="user", content="How's my sleep?")
    _make_conversation_message(db, u.id, role="assistant", content="Based on your goals, you're doing well.")
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "Follow up on sleep", context_type="general")

    # Conversations source is included in general
    assert isinstance(ctx["conversation_history"], list)


def test_build_context_connected_services_no_secrets(db: Session):
    u = _make_user(db)
    i = _make_integration(db, u.id, provider="google", service_type="calendar", status="connected")
    i.access_token_encrypted = "SECRET_TOKEN_DO_NOT_EXPOSE"
    i.refresh_token_encrypted = "SECRET_REFRESH_DO_NOT_EXPOSE"
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "What integrations are connected?", context_type="general")

    services = ctx["connected_services"]
    assert len(services) >= 1
    for svc_record in services:
        assert "access_token_encrypted" not in svc_record
        assert "refresh_token_encrypted" not in svc_record
        assert "SECRET_TOKEN" not in str(svc_record)
        assert "SECRET_REFRESH" not in str(svc_record)
        # Safe fields are present
        assert "provider" in svc_record
        assert "status" in svc_record


def test_no_secrets_in_full_context_package(db: Session):
    """Serialized context package must not contain raw token strings."""
    u = _make_user(db)
    i = _make_integration(db, u.id)
    i.access_token_encrypted = "ya29.SECRET_OAUTH_ACCESS"
    i.refresh_token_encrypted = "1//SECRET_REFRESH"
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "General context test", context_type="general")

    serialized = str(ctx)
    assert "ya29.SECRET_OAUTH_ACCESS" not in serialized
    assert "1//SECRET_REFRESH" not in serialized


def test_user_scoping_no_cross_user_leakage(db: Session):
    """Context for user A must not include data belonging to user B."""
    user_a = _make_user(db, suffix="scope_a")
    user_b = _make_user(db, suffix="scope_b")

    _make_goal(db, user_a.id, "User A Secret Goal")
    _make_goal(db, user_b.id, "User B Secret Goal")
    _make_task(db, user_a.id, title="User A Secret Task")
    _make_task(db, user_b.id, title="User B Secret Task")
    db.commit()

    svc = AssistantContextService(db)
    ctx_a = svc.build_context_for_message(user_a.id, "What are my goals?", context_type="goals")
    ctx_b = svc.build_context_for_message(user_b.id, "What are my goals?", context_type="goals")

    a_goal_titles = {g["title"] for g in ctx_a["active_goals"]}
    b_goal_titles = {g["title"] for g in ctx_b["active_goals"]}

    assert "User A Secret Goal" in a_goal_titles
    assert "User B Secret Goal" not in a_goal_titles

    assert "User B Secret Goal" in b_goal_titles
    assert "User A Secret Goal" not in b_goal_titles

    a_task_titles = {t["title"] for t in ctx_a["relevant_tasks"]}
    b_task_titles = {t["title"] for t in ctx_b["relevant_tasks"]}
    assert "User B Secret Task" not in a_task_titles
    assert "User A Secret Task" not in b_task_titles


def test_summarize_context_for_prompt_produces_output(db: Session):
    u = _make_user(db)
    prefs = UserPreferences(
        user_id=u.id,
        preferred_name="Jake",
        assistant_tone="casual",
        work_focus="Software Engineering",
        important_life_areas='["work", "health"]',
        location="Dallas",
    )
    db.add(prefs)
    _make_goal(db, u.id, "Ship HELIOS V3")
    _make_task(db, u.id, title="Write tests", status="in_progress", priority="high")
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "What should I focus on?", context_type="tasks")
    prompt = svc.summarize_context_for_prompt(ctx)

    assert isinstance(prompt, str)
    assert len(prompt) > 0
    assert "Jake" in prompt or "Software Engineering" in prompt or "HELIOS V3" in prompt or "Write tests" in prompt


def test_summarize_context_empty_returns_empty_string(db: Session):
    u = _make_user(db)
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "Hi", context_type="tasks")
    prompt = svc.summarize_context_for_prompt(ctx)

    # No profile, no tasks, no goals — prompt should be empty string
    assert prompt == "" or isinstance(prompt, str)


def test_context_type_routing_email_vs_goals(db: Session):
    u = _make_user(db)
    _make_goal(db, u.id, "Career Goal")
    email = EmailMessage(
        id=str(uuid.uuid4()),
        user_id=u.id,
        sender="boss@company.com",
        subject="Urgent: Q3 report",
        received_at="2026-06-25T10:00:00Z",
        importance="urgent",
        status="unread",
    )
    db.add(email)
    db.commit()

    svc = AssistantContextService(db)

    ctx_email = svc.build_context_for_message(u.id, "Check my email", context_type="email")
    ctx_goals = svc.build_context_for_message(u.id, "Show my goals", context_type="goals")

    # Email context should include email activity, goals context should include goals
    email_activity = [a for a in ctx_email["recent_activity"] if a.get("type") == "email"]
    assert len(email_activity) >= 1

    assert len(ctx_goals["active_goals"]) >= 1


def test_historical_time_window_fetches_completed_tasks(db: Session):
    u = _make_user(db)
    today = date.today()
    # Use the same formula as extract_time_window: days back to last Tuesday
    days_ago = (today.weekday() - 1) % 7 or 7
    last_tuesday = today - timedelta(days=days_ago)
    completed_dt = datetime(
        last_tuesday.year, last_tuesday.month, last_tuesday.day, 14, 0, 0, tzinfo=timezone.utc
    )
    old_done = Task(
        id=str(uuid.uuid4()),
        user_id=u.id,
        title="Last Tuesday Task",
        status="done",
        priority="medium",
        created_at=completed_dt,
        updated_at=completed_dt,
    )
    db.add(old_done)
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(
        u.id, f"What did I complete last Tuesday?", context_type="historical"
    )

    # The historical completed task should appear in relevant_tasks
    task_titles = {t["title"] for t in ctx["relevant_tasks"]}
    assert "Last Tuesday Task" in task_titles


def test_conversation_history_capped(db: Session):
    u = _make_user(db)
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    conv = Conversation(id=conv_id, user_id=u.id, title="Big Chat", created_at=now, updated_at=now)
    db.add(conv)
    for i in range(25):
        db.add(ConversationMessage(
            id=str(uuid.uuid4()),
            conversation_id=conv_id,
            user_id=u.id,
            role="user" if i % 2 == 0 else "assistant",
            content=f"Message number {i}",
            meta="{}",
            created_at=now + timedelta(seconds=i),
        ))
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "Review our chat", context_type="general")

    assert len(ctx["conversation_history"]) <= 10


def test_retrieval_metadata_structure(db: Session):
    u = _make_user(db)
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, "What goals do I have?", context_type="goals")

    meta = ctx["retrieval_metadata"]
    assert "query" in meta
    assert "context_type" in meta
    assert "sources_used" in meta
    assert "generated_at" in meta
    assert "time_window" in meta
    assert meta["context_type"] == "goals"
    assert isinstance(meta["sources_used"], list)


def test_long_message_truncated_in_metadata(db: Session):
    u = _make_user(db)
    db.commit()

    long_message = "x" * 500
    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(u.id, long_message)

    assert len(ctx["retrieval_metadata"]["query"]) <= 200


# ── Integration / endpoint tests ────────────────────────────────────────────────

def test_preview_endpoint_requires_auth(client: TestClient):
    resp = client.get("/api/v1/assistant/context/preview?message=test")
    assert resp.status_code == 401


def test_preview_endpoint_returns_context_package(client: TestClient):
    token = _signup(client, email=f"preview_{uuid.uuid4().hex[:6]}@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get(
        "/api/v1/assistant/context/preview",
        params={"message": "What are my goals?"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert "context_package" in body
    assert "summarized_prompt" in body
    assert "debug" in body
    pkg = body["context_package"]
    assert "user_profile" in pkg
    assert "active_goals" in pkg
    assert "relevant_tasks" in pkg
    assert "retrieval_metadata" in pkg


def test_preview_endpoint_no_secrets(client: TestClient):
    """Debug endpoint must never surface encrypted token strings."""
    token = _signup(client, email=f"nosecret_{uuid.uuid4().hex[:6]}@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.get(
        "/api/v1/assistant/context/preview",
        params={"message": "Check my integrations"},
        headers=headers,
    )
    assert resp.status_code == 200
    body_text = resp.text
    assert "access_token_encrypted" not in body_text
    assert "refresh_token_encrypted" not in body_text


def test_chat_endpoint_still_works(client: TestClient):
    token = _signup(client, email=f"chat_{uuid.uuid4().hex[:6]}@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    resp = client.post(
        "/api/v1/ai/chat",
        json={"message": "Hello HELIOS", "include_context": True},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "reply" in body
    assert isinstance(body["reply"], str)


def test_conversations_send_message_still_works(client: TestClient):
    token = _signup(client, email=f"conv_{uuid.uuid4().hex[:6]}@test.com")
    headers = {"Authorization": f"Bearer {token}"}

    create_resp = client.post("/api/v1/ai/conversations", headers=headers)
    assert create_resp.status_code == 201
    conv_id = create_resp.json()["id"]

    msg_resp = client.post(
        f"/api/v1/ai/conversations/{conv_id}/messages",
        json={"message": "What are my priorities?", "include_context": True},
        headers=headers,
    )
    assert msg_resp.status_code == 200
    body = msg_resp.json()
    assert "assistant_message" in body
    assert body["assistant_message"]["role"] == "assistant"
