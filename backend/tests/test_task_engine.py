import uuid
from datetime import date, datetime, timedelta, timezone

import pytest


def _now() -> datetime:
    return datetime.now(timezone.utc)


@pytest.fixture
def task_engine_user(db):
    from app.core.jwt import create_access_token
    from app.core.security import hash_password
    from app.models.user import User

    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        name="Task Engine User",
        email=f"task-engine-{user_id}@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=_now(),
    )
    db.add(user)
    db.commit()
    return create_access_token(user_id), user_id


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _goal(db, user_id: str, title: str = "Launch HELIOS"):
    from app.models.goal import Goal

    goal = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="Ship the private beta.",
        status="active",
        priority="high",
        target_date=(date.today() + timedelta(days=14)).isoformat(),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(goal)
    return goal


def _email(db, user_id: str, subject: str = "Please review launch checklist"):
    from app.models.email import EmailMessage

    message = EmailMessage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        sender="stark@example.com",
        subject=subject,
        snippet="Please review and confirm the launch checklist before tomorrow.",
        received_at=_now().isoformat(),
        importance="high",
        status="unread",
        source="gmail",
        external_message_id=str(uuid.uuid4()),
        labels=["INBOX", "IMPORTANT"],
        raw_metadata={"body": "FULL PRIVATE BODY SHOULD NOT LEAK"},
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(message)
    return message


def _event(db, user_id: str, title: str = "HELIOS Beta Review", *, days_from_now: int = 1):
    from app.models.calendar import CalendarEvent

    start = _now() + timedelta(days=days_from_now, hours=2)
    end = start + timedelta(hours=1)
    event = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="Review launch readiness.",
        start_time=start.isoformat(),
        end_time=end.isoformat(),
        source="google",
        external_event_id=str(uuid.uuid4()),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(event)
    return event


def _task(db, user_id: str, title: str = "Complete launch checklist", goal_id: str | None = None):
    from app.models.task import Task

    task = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        description="Finish the checklist.",
        status="todo",
        priority="high",
        due_date=date.today().isoformat(),
        linked_goal_id=goal_id,
        estimated_duration_minutes=30,
        category="Launch",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(task)
    return task


def _history_with_brief(db, user_id: str, goal_id: str | None = None):
    from app.models.daily_history import DailyHistory

    history = DailyHistory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        history_date=date.today(),
        timezone="UTC",
        day_type="today",
        status="open",
        summary="Daily brief ready.",
        daily_brief={
            "summary": "Start with launch readiness.",
            "next_best_action": {
                "type": "goal",
                "title": "Create HELIOS rollout checklist",
                "reason": "Daily brief recommends a concrete rollout checklist.",
                "estimated_duration_minutes": 25,
                "linked_goal_id": goal_id,
                "linked_task_id": None,
                "confidence": 0.8,
            },
        },
        completed_tasks=[],
        planned_tasks=[],
        overdue_tasks=[],
        goals_snapshot=[],
        calendar_events=[],
        focus_blocks=[],
        assistant_activity=[],
        integration_activity=[],
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(history)
    return history


def test_generate_suggestions_from_gmail_calendar_goals_daily_brief(client, db, task_engine_user):
    token, user_id = task_engine_user
    goal = _goal(db, user_id)
    _email(db, user_id)
    _event(db, user_id)
    _history_with_brief(db, user_id, goal.id)
    db.commit()

    response = client.post(
        "/api/v1/task-engine/suggestions/generate",
        headers=_auth(token),
        json={"sources": ["gmail", "calendar", "goals", "daily_brief", "next_best_action"], "limit": 20},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    source_types = {item["source_type"] for item in body["suggestions"]}
    assert {"gmail", "calendar", "goals", "daily_brief"} <= source_types
    assert body["next_best_action"]["title"]
    assert "FULL PRIVATE BODY SHOULD NOT LEAK" not in str(body)


def test_accept_suggestion_creates_task_with_source_metadata(client, db, task_engine_user):
    from app.models.task import Task
    from app.models.task_suggestion import TaskSuggestion

    token, user_id = task_engine_user
    _email(db, user_id)
    db.commit()

    generated = client.post(
        "/api/v1/task-engine/suggestions/generate",
        headers=_auth(token),
        json={"sources": ["gmail"], "limit": 5},
    )
    suggestion = generated.json()["suggestions"][0]

    accepted = client.post(
        f"/api/v1/task-engine/suggestions/{suggestion['id']}/accept",
        headers=_auth(token),
        json={},
    )

    assert accepted.status_code == 201, accepted.text
    body = accepted.json()
    assert body["suggestion"]["status"] == "accepted"
    assert body["task"]["source"] == "gmail"
    assert body["task"]["source_metadata"]["suggestion_id"] == suggestion["id"]
    assert db.get(TaskSuggestion, suggestion["id"]).accepted_task_id == body["task"]["id"]
    assert db.get(Task, body["task"]["id"]).source == "gmail"


def test_reject_suggestion_marks_it_rejected(client, db, task_engine_user):
    token, user_id = task_engine_user
    _email(db, user_id)
    db.commit()

    generated = client.post(
        "/api/v1/task-engine/suggestions/generate",
        headers=_auth(token),
        json={"sources": ["gmail"], "limit": 5},
    )
    suggestion = generated.json()["suggestions"][0]

    rejected = client.post(
        f"/api/v1/task-engine/suggestions/{suggestion['id']}/reject",
        headers=_auth(token),
        json={"reason": "Not useful right now."},
    )

    assert rejected.status_code == 200, rejected.text
    body = rejected.json()
    assert body["status"] == "rejected"
    assert body["rejected_reason"] == "Not useful right now."


def test_schedule_task_into_available_window(client, db, task_engine_user):
    token, user_id = task_engine_user
    task = _task(db, user_id)
    db.commit()

    response = client.post(
        f"/api/v1/task-engine/tasks/{task.id}/schedule",
        headers=_auth(token),
        json={"date": date.today().isoformat()},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["task"]["scheduled_start"]
    assert body["calendar_event"]["linked_task_id"] == task.id
    assert body["selected_window"]["duration_minutes"] >= 30


def test_complete_task_updates_daily_history_and_goal_progress(client, db, task_engine_user):
    from app.models.daily_history import DailyHistory
    from app.models.goal import Goal
    from app.models.task import Task

    token, user_id = task_engine_user
    goal = _goal(db, user_id)
    task = _task(db, user_id, goal_id=goal.id)
    db.commit()

    response = client.post(
        f"/api/v1/task-engine/tasks/{task.id}/complete",
        headers=_auth(token),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["task"]["status"] == "done"
    assert body["daily_history_updated"] is True
    assert body["goal_progress"]["completed_tasks"] == 1
    db.expire_all()
    assert db.get(Task, task.id).status == "done"
    assert db.get(Goal, goal.id).manual_progress == 1.0
    history = db.query(DailyHistory).filter_by(user_id=user_id, history_date=date.today()).one()
    assert history.completed_tasks[0]["id"] == task.id


def test_user_cannot_accept_other_users_suggestion(client, db, task_engine_user):
    from app.core.jwt import create_access_token
    from app.core.security import hash_password
    from app.models.task_suggestion import TaskSuggestion
    from app.models.user import User

    token, _user_id = task_engine_user
    other_id = str(uuid.uuid4())
    db.add(User(
        id=other_id,
        name="Other User",
        email=f"other-{other_id}@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=_now(),
    ))
    suggestion = TaskSuggestion(
        id=str(uuid.uuid4()),
        user_id=other_id,
        title="Other private suggestion",
        status="pending",
        priority="medium",
        source_type="gmail",
        source_id="message-1",
        confidence=0.8,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(suggestion)
    db.commit()

    response = client.post(
        f"/api/v1/task-engine/suggestions/{suggestion.id}/accept",
        headers=_auth(token),
        json={},
    )

    assert response.status_code == 404
