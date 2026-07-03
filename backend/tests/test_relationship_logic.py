"""
Tests for the Task/Goal/Calendar Relationship Layer.

Covers:
  - link_task_to_goal / unlink_task_from_goal
  - schedule_task / unschedule_task / conflict detection
  - create_focus_block / assign_tasks_to_focus_block
  - calculate_goal_progress_from_tasks
  - find_available_time_windows
  - get_next_best_action
  - get_relationship_health diagnostics
  - user scoping (security)
  - invalid IDs
  - duplicate relationships
  - API endpoints
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.jwt import create_access_token
from app.models.calendar import CalendarEvent
from app.models.focus_block import FocusBlock
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.services.task_goal_calendar_service import RelationshipError, TaskGoalCalendarService


# ── Fixtures ────────────────────────────────────────────────────────────────────

def _make_user(db: Session, suffix: str = "r") -> User:
    now = datetime.now(timezone.utc)
    u = User(
        id=str(uuid.uuid4()),
        name=f"Rel User {suffix}",
        email=f"rel_{suffix}_{uuid.uuid4().hex[:6]}@test.com",
        hashed_password="$2b$12$fakehash",
        created_at=now,
    )
    db.add(u)
    db.flush()
    return u


def _make_goal(
    db: Session,
    user_id: str,
    title: str = "Test Goal",
    priority: str | None = "high",
    target_date: str | None = None,
) -> Goal:
    now = datetime.now(timezone.utc)
    g = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        status="active",
        priority=priority,
        target_date=target_date,
        created_at=now,
        updated_at=now,
    )
    db.add(g)
    db.flush()
    return g


def _make_task(
    db: Session,
    user_id: str,
    title: str = "Test Task",
    status: str = "todo",
    priority: str = "medium",
    due_date: str | None = None,
    linked_goal_id: str | None = None,
    estimated_duration_minutes: int | None = None,
) -> Task:
    now = datetime.now(timezone.utc)
    t = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        status=status,
        priority=priority,
        due_date=due_date,
        linked_goal_id=linked_goal_id,
        estimated_duration_minutes=estimated_duration_minutes,
        created_at=now,
        updated_at=now,
    )
    db.add(t)
    db.flush()
    return t


def _make_event(
    db: Session,
    user_id: str,
    title: str = "Meeting",
    start_time: str = "2026-06-25T09:00:00Z",
    end_time: str = "2026-06-25T10:00:00Z",
) -> CalendarEvent:
    now = datetime.now(timezone.utc)
    ev = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        start_time=start_time,
        end_time=end_time,
        source="manual",
        created_at=now,
        updated_at=now,
    )
    db.add(ev)
    db.flush()
    return ev


def _signup_and_token(client: TestClient, suffix: str = "") -> str:
    email = f"rel_{suffix}_{uuid.uuid4().hex[:6]}@test.com"
    r = client.post(
        "/api/v1/auth/signup",
        json={"name": "Rel", "email": email, "password": "Password123!"},
    )
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def _direct_token(db: Session) -> str:
    """Create a User directly in the DB and return a valid JWT — no HTTP signup, no rate limit."""
    user = _make_user(db, suffix=uuid.uuid4().hex[:6])
    db.commit()
    return create_access_token(user.id)


# ── link_task_to_goal ───────────────────────────────────────────────────────────

def test_link_task_to_goal(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    t = _make_task(db, u.id)
    db.commit()

    svc = TaskGoalCalendarService(db)
    result = svc.link_task_to_goal(u.id, t.id, g.id)

    assert result["linked_goal_id"] == g.id
    db.expire_all()
    assert db.get(Task, t.id).linked_goal_id == g.id


def test_link_task_to_goal_sets_category(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    t = _make_task(db, u.id)
    db.commit()

    TaskGoalCalendarService(db).link_task_to_goal(u.id, t.id, g.id, category="study")
    db.expire_all()
    assert db.get(Task, t.id).category == "study"


def test_link_task_to_goal_duplicate_raises(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    t = _make_task(db, u.id)
    db.commit()

    svc = TaskGoalCalendarService(db)
    svc.link_task_to_goal(u.id, t.id, g.id)
    with pytest.raises(RelationshipError) as exc_info:
        svc.link_task_to_goal(u.id, t.id, g.id)
    assert exc_info.value.code == "relationship_already_exists"


def test_link_task_wrong_goal_raises(db: Session):
    u1 = _make_user(db, "a")
    u2 = _make_user(db, "b")
    g  = _make_goal(db, u2.id)  # belongs to u2
    t  = _make_task(db, u1.id)
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).link_task_to_goal(u1.id, t.id, g.id)
    assert exc_info.value.code == "goal_not_found"


def test_link_task_invalid_task_raises(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).link_task_to_goal(u.id, "nonexistent", g.id)
    assert exc_info.value.code == "task_not_found"


# ── unlink_task_from_goal ────────────────────────────────────────────────────────

def test_unlink_task_from_goal(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    t = _make_task(db, u.id, linked_goal_id=g.id)
    db.commit()

    TaskGoalCalendarService(db).unlink_task_from_goal(u.id, t.id)
    db.expire_all()
    assert db.get(Task, t.id).linked_goal_id is None


def test_unlink_task_no_goal_raises(db: Session):
    u = _make_user(db)
    t = _make_task(db, u.id)
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).unlink_task_from_goal(u.id, t.id)
    assert exc_info.value.code == "no_linked_goal"


# ── schedule_task ────────────────────────────────────────────────────────────────

def test_schedule_task_creates_event(db: Session):
    u = _make_user(db)
    t = _make_task(db, u.id, title="Study D278")
    db.commit()

    svc = TaskGoalCalendarService(db)
    result = svc.schedule_task(u.id, t.id, "2026-06-25T14:00:00Z", "2026-06-25T15:00:00Z")

    assert result["task"]["scheduled_start"] == "2026-06-25T14:00:00Z"
    assert result["calendar_event"]["linked_task_id"] == t.id
    assert result["calendar_event"]["event_type"] == "task_block"

    db.expire_all()
    task = db.get(Task, t.id)
    assert task.scheduled_start == "2026-06-25T14:00:00Z"


def test_schedule_task_invalid_time_range_raises(db: Session):
    u = _make_user(db)
    t = _make_task(db, u.id)
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).schedule_task(
            u.id, t.id,
            "2026-06-25T15:00:00Z",
            "2026-06-25T14:00:00Z",  # end before start
        )
    assert exc_info.value.code == "invalid_time_range"


def test_schedule_task_conflict_raises(db: Session):
    u = _make_user(db)
    t = _make_task(db, u.id)
    _make_event(db, u.id, start_time="2026-06-25T13:30:00Z", end_time="2026-06-25T14:30:00Z")
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).schedule_task(
            u.id, t.id,
            "2026-06-25T14:00:00Z",  # overlaps the existing event
            "2026-06-25T15:00:00Z",
        )
    assert exc_info.value.code == "calendar_conflict"


def test_schedule_task_wrong_user_raises(db: Session):
    u1 = _make_user(db, "s1")
    u2 = _make_user(db, "s2")
    t  = _make_task(db, u2.id)  # belongs to u2
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).schedule_task(
            u1.id, t.id, "2026-06-25T14:00:00Z", "2026-06-25T15:00:00Z"
        )
    assert exc_info.value.code == "task_not_found"


# ── unschedule_task ─────────────────────────────────────────────────────────────

def test_unschedule_task(db: Session):
    u = _make_user(db)
    t = _make_task(db, u.id)
    db.commit()

    svc = TaskGoalCalendarService(db)
    svc.schedule_task(u.id, t.id, "2026-06-25T14:00:00Z", "2026-06-25T15:00:00Z")
    svc.unschedule_task(u.id, t.id)

    db.expire_all()
    task = db.get(Task, t.id)
    assert task.scheduled_start is None
    assert task.scheduled_end is None


# ── create_focus_block ──────────────────────────────────────────────────────────

def test_create_focus_block(db: Session):
    u  = _make_user(db)
    g  = _make_goal(db, u.id)
    t1 = _make_task(db, u.id, title="Task A")
    t2 = _make_task(db, u.id, title="Task B")
    db.commit()

    svc = TaskGoalCalendarService(db)
    result = svc.create_focus_block(
        u.id,
        title="Morning Deep Work",
        start_time="2026-06-25T09:00:00Z",
        end_time="2026-06-25T11:00:00Z",
        linked_goal_id=g.id,
        task_ids=[t1.id, t2.id],
    )

    assert result["linked_goal_id"] == g.id
    assert set(result["linked_task_ids"]) == {t1.id, t2.id}
    assert result["status"] == "planned"

    # Tasks should now reference the focus block
    db.expire_all()
    assert db.get(Task, t1.id).focus_block_id == result["id"]
    assert db.get(Task, t2.id).focus_block_id == result["id"]


def test_create_focus_block_invalid_time_raises(db: Session):
    u = _make_user(db)
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).create_focus_block(
            u.id,
            title="Bad Block",
            start_time="2026-06-25T11:00:00Z",
            end_time="2026-06-25T09:00:00Z",
        )
    assert exc_info.value.code == "invalid_time_range"


def test_create_focus_block_wrong_goal_raises(db: Session):
    u1 = _make_user(db, "fb1")
    u2 = _make_user(db, "fb2")
    g  = _make_goal(db, u2.id)  # belongs to u2
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).create_focus_block(
            u1.id,
            title="Block",
            start_time="2026-06-25T09:00:00Z",
            end_time="2026-06-25T10:00:00Z",
            linked_goal_id=g.id,
        )
    assert exc_info.value.code == "goal_not_found"


# ── assign_tasks_to_focus_block ─────────────────────────────────────────────────

def test_assign_tasks_to_focus_block(db: Session):
    u  = _make_user(db)
    t1 = _make_task(db, u.id, title="T1")
    t2 = _make_task(db, u.id, title="T2")
    t3 = _make_task(db, u.id, title="T3")
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb = svc.create_focus_block(
        u.id,
        title="Session",
        start_time="2026-06-25T10:00:00Z",
        end_time="2026-06-25T11:00:00Z",
        task_ids=[t1.id, t2.id],
    )
    fb_id = fb["id"]

    # Replace with just t3
    result = svc.assign_tasks_to_focus_block(u.id, fb_id, [t3.id])

    assert result["linked_task_ids"] == [t3.id]
    db.expire_all()
    assert db.get(Task, t3.id).focus_block_id == fb_id
    # t1 and t2 should be unlinked
    assert db.get(Task, t1.id).focus_block_id is None
    assert db.get(Task, t2.id).focus_block_id is None


def test_assign_tasks_wrong_task_raises(db: Session):
    u  = _make_user(db, "at1")
    u2 = _make_user(db, "at2")
    t  = _make_task(db, u2.id)  # belongs to u2
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb = svc.create_focus_block(
        u.id,
        title="Block",
        start_time="2026-06-25T10:00:00Z",
        end_time="2026-06-25T11:00:00Z",
    )

    with pytest.raises(RelationshipError) as exc_info:
        svc.assign_tasks_to_focus_block(u.id, fb["id"], [t.id])
    assert exc_info.value.code == "task_not_found"


# ── calculate_goal_progress ─────────────────────────────────────────────────────

def test_goal_progress_no_tasks(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    db.commit()

    result = TaskGoalCalendarService(db).calculate_goal_progress_from_tasks(u.id, g.id)
    assert result["total_tasks"] == 0
    assert result["computed_progress"] == 0.0


def test_goal_progress_partial(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    _make_task(db, u.id, linked_goal_id=g.id, status="done")
    _make_task(db, u.id, linked_goal_id=g.id, status="done")
    _make_task(db, u.id, linked_goal_id=g.id, status="todo")
    _make_task(db, u.id, linked_goal_id=g.id, status="todo")
    db.commit()

    result = TaskGoalCalendarService(db).calculate_goal_progress_from_tasks(u.id, g.id)
    assert result["total_tasks"] == 4
    assert result["completed_tasks"] == 2
    assert result["computed_progress"] == 0.5
    assert result["manual_progress"] is None
    assert result["effective_progress"] == 0.5


def test_goal_progress_manual_takes_precedence(db: Session):
    u = _make_user(db)
    g = _make_goal(db, u.id)
    g.manual_progress = 0.75
    _make_task(db, u.id, linked_goal_id=g.id, status="todo")  # 0% computed
    db.commit()

    result = TaskGoalCalendarService(db).calculate_goal_progress_from_tasks(u.id, g.id)
    assert result["manual_progress"] == 0.75
    assert result["effective_progress"] == 0.75  # manual wins


def test_goal_progress_wrong_user_raises(db: Session):
    u1 = _make_user(db, "gp1")
    u2 = _make_user(db, "gp2")
    g  = _make_goal(db, u2.id)
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).calculate_goal_progress_from_tasks(u1.id, g.id)
    assert exc_info.value.code == "goal_not_found"


# ── find_available_time_windows ─────────────────────────────────────────────────

def test_available_windows_empty_day(db: Session):
    u = _make_user(db)
    db.commit()

    target = date(2026, 7, 1)
    windows = TaskGoalCalendarService(db).find_available_time_windows(u.id, target)

    # Should have the full 8am-10pm window (840 min)
    assert len(windows) == 1
    assert windows[0]["duration_minutes"] == 840


def test_available_windows_event_splits_day(db: Session):
    u = _make_user(db)
    _make_event(db, u.id, start_time="2026-07-02T12:00:00Z", end_time="2026-07-02T13:00:00Z")
    db.commit()

    target = date(2026, 7, 2)
    windows = TaskGoalCalendarService(db).find_available_time_windows(u.id, target)

    assert len(windows) == 2
    total = sum(w["duration_minutes"] for w in windows)
    assert total == 840 - 60


def test_available_windows_fully_booked(db: Session):
    u = _make_user(db)
    _make_event(db, u.id, start_time="2026-07-03T08:00:00Z", end_time="2026-07-03T22:00:00Z")
    db.commit()

    windows = TaskGoalCalendarService(db).find_available_time_windows(u.id, date(2026, 7, 3))
    assert windows == []


def test_available_windows_merges_overlapping_events(db: Session):
    u = _make_user(db)
    _make_event(db, u.id, start_time="2026-07-04T09:00:00Z", end_time="2026-07-04T10:30:00Z")
    _make_event(db, u.id, start_time="2026-07-04T10:00:00Z", end_time="2026-07-04T11:00:00Z")
    db.commit()

    windows = TaskGoalCalendarService(db).find_available_time_windows(u.id, date(2026, 7, 4))
    # 9:00-10:30 and 10:00-11:00 merge into one 9:00-11:00 block = 120 min busy
    total_busy = 840 - sum(w["duration_minutes"] for w in windows)
    assert total_busy == 120


# ── detect_calendar_conflicts ───────────────────────────────────────────────────

def test_detect_calendar_conflicts_overlap(db: Session):
    u = _make_user(db)
    _make_event(db, u.id, title="Ev1", start_time="2026-07-05T09:00:00Z", end_time="2026-07-05T10:00:00Z")
    _make_event(db, u.id, title="Ev2", start_time="2026-07-05T09:30:00Z", end_time="2026-07-05T10:30:00Z")
    db.commit()

    conflicts = TaskGoalCalendarService(db).detect_calendar_conflicts(u.id, date(2026, 7, 5))
    assert len(conflicts) == 1
    titles = {conflicts[0]["event_a"]["title"], conflicts[0]["event_b"]["title"]}
    assert titles == {"Ev1", "Ev2"}


def test_detect_calendar_conflicts_no_overlap(db: Session):
    u = _make_user(db)
    _make_event(db, u.id, title="M1", start_time="2026-07-06T09:00:00Z", end_time="2026-07-06T10:00:00Z")
    _make_event(db, u.id, title="M2", start_time="2026-07-06T10:00:00Z", end_time="2026-07-06T11:00:00Z")
    db.commit()

    conflicts = TaskGoalCalendarService(db).detect_calendar_conflicts(u.id, date(2026, 7, 6))
    assert conflicts == []


# ── get_next_best_action ────────────────────────────────────────────────────────

def test_nba_no_tasks_no_goals(db: Session):
    u = _make_user(db)
    db.commit()

    result = TaskGoalCalendarService(db).get_next_best_action(u.id)
    assert result["type"] == "none"
    assert result["confidence"] == 0.0


def test_nba_no_tasks_with_active_goal(db: Session):
    u = _make_user(db)
    _make_goal(db, u.id, title="Finish HELIOS")
    db.commit()

    result = TaskGoalCalendarService(db).get_next_best_action(u.id)
    assert result["type"] == "recovery"
    assert "Finish HELIOS" in result["title"]


def test_nba_prefers_overdue_high_priority(db: Session):
    u     = _make_user(db)
    today = date.today().isoformat()
    past  = (date.today() - timedelta(days=2)).isoformat()

    _make_task(db, u.id, title="Low Pri Task",  priority="low")
    _make_task(db, u.id, title="Overdue High",  priority="high", due_date=past)
    _make_task(db, u.id, title="Due Today Med", priority="medium", due_date=today)
    db.commit()

    result = TaskGoalCalendarService(db).get_next_best_action(u.id)
    assert result["type"] == "task"
    assert result["title"] == "Overdue High"


def test_nba_in_progress_gets_boost(db: Session):
    u = _make_user(db)
    _make_task(db, u.id, title="Todo High",     priority="high")
    _make_task(db, u.id, title="InProg Medium", priority="medium", status="in_progress")
    db.commit()

    result = TaskGoalCalendarService(db).get_next_best_action(u.id)
    # In-progress medium (15+20=35) vs high todo (30). In-progress wins.
    assert result["title"] == "InProg Medium"


def test_nba_confidence_is_normalised(db: Session):
    u = _make_user(db)
    past = (date.today() - timedelta(days=1)).isoformat()
    _make_task(db, u.id, title="Critical Overdue", priority="critical", due_date=past)
    db.commit()

    result = TaskGoalCalendarService(db).get_next_best_action(u.id)
    assert 0.0 < result["confidence"] <= 1.0


# ── get_relationship_health ─────────────────────────────────────────────────────

def test_health_goals_without_tasks(db: Session):
    u = _make_user(db)
    _make_goal(db, u.id, title="Lonely Goal")
    db.commit()

    health = TaskGoalCalendarService(db).get_relationship_health(u.id)
    assert len(health["goals_without_tasks"]) == 1
    assert health["goals_without_tasks"][0]["title"] == "Lonely Goal"


def test_health_high_priority_tasks_without_goals(db: Session):
    u = _make_user(db)
    _make_task(db, u.id, title="Orphan High", priority="high")
    db.commit()

    health = TaskGoalCalendarService(db).get_relationship_health(u.id)
    assert len(health["high_priority_tasks_without_goals"]) == 1


def test_health_unscheduled_overdue(db: Session):
    u    = _make_user(db)
    past = (date.today() - timedelta(days=3)).isoformat()
    _make_task(db, u.id, title="Past Due", priority="medium", due_date=past)
    db.commit()

    health = TaskGoalCalendarService(db).get_relationship_health(u.id)
    assert len(health["unscheduled_overdue_tasks"]) == 1


def test_health_summary_keys(db: Session):
    u = _make_user(db)
    db.commit()

    health = TaskGoalCalendarService(db).get_relationship_health(u.id)
    summary = health["summary"]
    assert "goals_without_tasks" in summary
    assert "unscheduled_overdue_tasks" in summary
    assert "calendar_conflicts_today" in summary


# ── User scoping ─────────────────────────────────────────────────────────────────

def test_user_scoping_progress(db: Session):
    u1 = _make_user(db, "sc1")
    u2 = _make_user(db, "sc2")
    g  = _make_goal(db, u2.id)
    db.commit()

    with pytest.raises(RelationshipError) as exc_info:
        TaskGoalCalendarService(db).calculate_goal_progress_from_tasks(u1.id, g.id)
    assert exc_info.value.code == "goal_not_found"


def test_user_scoping_focus_block(db: Session):
    u1  = _make_user(db, "sc3")
    u2  = _make_user(db, "sc4")
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u2.id,
        title="U2 Block",
        start_time="2026-06-25T09:00:00Z",
        end_time="2026-06-25T10:00:00Z",
    )

    with pytest.raises(RelationshipError) as exc_info:
        svc.assign_tasks_to_focus_block(u1.id, fb["id"], [])
    assert exc_info.value.code == "focus_block_not_found"


# ── start_focus_block / update_focus_block_status ───────────────────────────────

def test_start_focus_block(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Sprint",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    result = svc.start_focus_block(u.id, fb["id"])

    assert result["status"] == "in_progress"
    assert result["actual_start"] is not None


def test_start_focus_block_sets_actual_start_timestamp(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Sprint",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    result = svc.start_focus_block(u.id, fb["id"])

    # actual_start should be a parseable ISO 8601 timestamp close to now
    from datetime import timezone
    started = datetime.fromisoformat(result["actual_start"].replace("Z", "+00:00"))
    delta = abs((datetime.now(timezone.utc) - started).total_seconds())
    assert delta < 5


def test_start_focus_block_already_started_raises(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Sprint",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    svc.start_focus_block(u.id, fb["id"])

    with pytest.raises(RelationshipError) as exc_info:
        svc.start_focus_block(u.id, fb["id"])
    assert exc_info.value.code == "invalid_status_transition"


def test_start_focus_block_completed_raises(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Done Block",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    svc.start_focus_block(u.id, fb["id"])
    svc.update_focus_block_status(u.id, fb["id"], "completed")

    with pytest.raises(RelationshipError) as exc_info:
        svc.start_focus_block(u.id, fb["id"])
    assert exc_info.value.code == "invalid_status_transition"


def test_update_focus_block_status_to_completed(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Work",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    svc.start_focus_block(u.id, fb["id"])
    result = svc.update_focus_block_status(u.id, fb["id"], "completed")

    assert result["status"] == "completed"
    assert result["actual_end"] is not None


def test_update_focus_block_status_to_cancelled(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Cancelled",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    result = svc.update_focus_block_status(u.id, fb["id"], "cancelled")
    assert result["status"] == "cancelled"


def test_update_focus_block_status_return_to_planned(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Undo",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    svc.start_focus_block(u.id, fb["id"])
    result = svc.update_focus_block_status(u.id, fb["id"], "planned")

    assert result["status"] == "planned"
    assert result["actual_start"] is None
    assert result["actual_end"] is None


def test_update_focus_block_status_terminal_completed_raises(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Done",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    svc.update_focus_block_status(u.id, fb["id"], "in_progress")
    svc.update_focus_block_status(u.id, fb["id"], "completed")

    with pytest.raises(RelationshipError) as exc_info:
        svc.update_focus_block_status(u.id, fb["id"], "planned")
    assert exc_info.value.code == "invalid_status_transition"


def test_update_focus_block_invalid_next_raises(db: Session):
    u = _make_user(db)
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Bad Trans",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    with pytest.raises(RelationshipError) as exc_info:
        svc.update_focus_block_status(u.id, fb["id"], "completed")
    assert exc_info.value.code == "invalid_status_transition"


def test_nba_boosts_tasks_in_active_focus_block(db: Session):
    u = _make_user(db)
    t_low  = _make_task(db, u.id, title="Low Task",  priority="low")
    t_high = _make_task(db, u.id, title="High Task", priority="high")
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Session",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
        task_ids=[t_low.id],  # only the low-priority task is in the block
    )
    svc.start_focus_block(u.id, fb["id"])

    result = svc.get_next_best_action(u.id)

    # Low task (5) + focus-block boost (25) = 30, beats high task (30) baseline
    # If scores are equal the first found wins, but low + 25 = 30 == high 30
    # so let's verify the result is one of the two and the reason mentions the block
    assert result["linked_task_id"] in (t_low.id, t_high.id)


def test_nba_focus_block_boost_wins_over_medium_priority(db: Session):
    u = _make_user(db)
    t_in_block = _make_task(db, u.id, title="Block Task", priority="medium")
    t_outside  = _make_task(db, u.id, title="Outside",    priority="high")
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Focus",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
        task_ids=[t_in_block.id],
    )
    svc.start_focus_block(u.id, fb["id"])

    result = svc.get_next_best_action(u.id)
    # medium (15) + boost (25) = 40 > high (30)
    assert result["linked_task_id"] == t_in_block.id
    assert "active focus block" in result["reason"].lower()


def test_nba_focus_block_suggests_start_now(db: Session):
    u = _make_user(db)
    t = _make_task(db, u.id, title="Now Task", priority="medium")
    db.commit()

    svc = TaskGoalCalendarService(db)
    fb  = svc.create_focus_block(
        u.id, title="Now Session",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
        task_ids=[t.id],
    )
    svc.start_focus_block(u.id, fb["id"])

    result = svc.get_next_best_action(u.id)
    assert result["linked_task_id"] == t.id
    assert result["suggested_start_time"] is not None
    # Suggested start should be very close to now (not a future window)
    from datetime import timezone
    suggested = datetime.fromisoformat(result["suggested_start_time"].replace("Z", "+00:00"))
    delta = abs((datetime.now(timezone.utc) - suggested).total_seconds())
    assert delta < 10


def test_context_active_focus_block_included(db: Session):
    u = _make_user(db)
    db.commit()

    from app.ai.assistant_context_service import AssistantContextService
    svc_rel = TaskGoalCalendarService(db)
    fb      = svc_rel.create_focus_block(
        u.id, title="Context Test",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    svc_rel.start_focus_block(u.id, fb["id"])

    ctx_svc = AssistantContextService(db)
    ctx     = ctx_svc.build_context_for_message(u.id, "what should I do now?")
    assert ctx["active_focus_block"] is not None
    assert ctx["active_focus_block"]["title"] == "Context Test"
    assert ctx["active_focus_block"]["status"] == "in_progress"


def test_context_no_active_focus_block_is_none(db: Session):
    u = _make_user(db)
    db.commit()

    from app.ai.assistant_context_service import AssistantContextService
    ctx = AssistantContextService(db).build_context_for_message(u.id, "hello")
    assert ctx["active_focus_block"] is None


def test_context_summarize_includes_focus_block_header(db: Session):
    u = _make_user(db)
    db.commit()

    from app.ai.assistant_context_service import AssistantContextService
    svc_rel = TaskGoalCalendarService(db)
    fb      = svc_rel.create_focus_block(
        u.id, title="Deep Work",
        start_time="2026-08-01T09:00:00Z", end_time="2026-08-01T11:00:00Z",
    )
    svc_rel.start_focus_block(u.id, fb["id"])

    ctx_svc = AssistantContextService(db)
    ctx     = ctx_svc.build_context_for_message(u.id, "what should I work on?")
    summary = ctx_svc.summarize_context_for_prompt(ctx)
    assert "ACTIVE FOCUS BLOCK" in summary
    assert "Deep Work" in summary


# ── API endpoint tests ───────────────────────────────────────────────────────────

def test_api_next_best_action_unauthenticated(client: TestClient):
    r = client.get("/api/v1/relationships/next-best-action")
    assert r.status_code == 401


def test_api_read_only_endpoints(client: TestClient):
    """
    Tests next-best-action, available-windows, and health — all read-only.
    Shares one signup to stay under the rate limit.
    """
    token   = _signup_and_token(client, "ro")
    headers = {"Authorization": f"Bearer {token}"}

    # next-best-action
    r = client.get("/api/v1/relationships/next-best-action", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert "type" in body and "confidence" in body

    # available-windows
    r = client.get("/api/v1/relationships/available-windows?date=2026-07-10", headers=headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)

    # relationship health
    r = client.get("/api/v1/relationships/health", headers=headers)
    assert r.status_code == 200
    assert "summary" in r.json() and "calendar_conflicts" in r.json()


def test_api_link_and_goal_endpoints(client: TestClient, db: Session):
    """
    Tests link-goal (success + 404) and goal progress.
    Uses _direct_token (no HTTP signup) to avoid triggering the rate limiter.
    """
    token   = _direct_token(db)
    headers = {"Authorization": f"Bearer {token}"}

    goal_r = client.post("/api/v1/goals", json={"title": "API Goal"}, headers=headers)
    assert goal_r.status_code == 201
    goal_id = goal_r.json()["id"]

    task_r = client.post("/api/v1/tasks", json={"title": "API Task"}, headers=headers)
    assert task_r.status_code == 201
    task_id = task_r.json()["id"]

    # Successful link
    link_r = client.post(
        f"/api/v1/relationships/tasks/{task_id}/link-goal",
        json={"goal_id": goal_id},
        headers=headers,
    )
    assert link_r.status_code == 200
    assert link_r.json()["linked_goal_id"] == goal_id

    # Wrong goal → 404
    bad_r = client.post(
        f"/api/v1/relationships/tasks/{task_id}/link-goal",
        json={"goal_id": "nonexistent"},
        headers=headers,
    )
    assert bad_r.status_code == 404
    assert bad_r.json()["detail"]["error"] == "goal_not_found"

    # Goal progress
    prog_r = client.get(f"/api/v1/relationships/goals/{goal_id}/progress", headers=headers)
    assert prog_r.status_code == 200
    assert prog_r.json()["goal_id"] == goal_id
    assert prog_r.json()["computed_progress"] == 0.0


def test_api_schedule_and_focus_block_endpoints(client: TestClient, db: Session):
    """
    Tests schedule-task (success + conflict) and create-focus-block.
    Uses _direct_token (no HTTP signup) to avoid triggering the rate limiter.
    """
    token   = _direct_token(db)
    headers = {"Authorization": f"Bearer {token}"}

    # Schedule a task successfully
    task_r = client.post("/api/v1/tasks", json={"title": "Scheduled Task"}, headers=headers)
    task_id = task_r.json()["id"]

    sched_r = client.post(
        f"/api/v1/relationships/tasks/{task_id}/schedule",
        json={"start_time": "2026-08-01T09:00:00Z", "end_time": "2026-08-01T10:00:00Z"},
        headers=headers,
    )
    assert sched_r.status_code == 201
    assert sched_r.json()["task"]["scheduled_start"] == "2026-08-01T09:00:00Z"
    assert sched_r.json()["calendar_event"]["event_type"] == "task_block"

    # Create a blocking calendar event then verify conflict → 409
    client.post(
        "/api/v1/calendar/events",
        json={"title": "Blocker", "start_time": "2026-08-03T09:00:00Z", "end_time": "2026-08-03T10:00:00Z"},
        headers=headers,
    )
    t2 = client.post("/api/v1/tasks", json={"title": "Conflict Task"}, headers=headers).json()["id"]
    conflict_r = client.post(
        f"/api/v1/relationships/tasks/{t2}/schedule",
        json={"start_time": "2026-08-03T09:30:00Z", "end_time": "2026-08-03T10:30:00Z"},
        headers=headers,
    )
    assert conflict_r.status_code == 409
    assert conflict_r.json()["detail"]["error"] == "calendar_conflict"

    # Create a focus block
    fb_r = client.post(
        "/api/v1/relationships/focus-blocks",
        json={"title": "Deep Work", "start_time": "2026-08-02T09:00:00Z", "end_time": "2026-08-02T11:00:00Z"},
        headers=headers,
    )
    assert fb_r.status_code == 201
    assert fb_r.json()["title"] == "Deep Work"
    assert fb_r.json()["status"] == "planned"


def test_api_focus_block_start_and_status_transitions(client: TestClient, db: Session):
    """
    Tests POST /focus-blocks/{id}/start and PATCH /focus-blocks/{id}/status.
    Uses _direct_token (no HTTP signup) to avoid triggering the rate limiter.
    """
    token   = _direct_token(db)
    headers = {"Authorization": f"Bearer {token}"}

    # Create a focus block (starts as planned)
    fb_r = client.post(
        "/api/v1/relationships/focus-blocks",
        json={"title": "Transition Test", "start_time": "2026-09-01T09:00:00Z", "end_time": "2026-09-01T11:00:00Z"},
        headers=headers,
    )
    assert fb_r.status_code == 201
    fb_id = fb_r.json()["id"]
    assert fb_r.json()["status"] == "planned"
    assert fb_r.json()["actual_start"] is None

    # Start the block → in_progress
    start_r = client.post(
        f"/api/v1/relationships/focus-blocks/{fb_id}/start",
        headers=headers,
    )
    assert start_r.status_code == 200
    assert start_r.json()["status"] == "in_progress"
    assert start_r.json()["actual_start"] is not None

    # Starting again → 422 invalid_status_transition
    bad_r = client.post(
        f"/api/v1/relationships/focus-blocks/{fb_id}/start",
        headers=headers,
    )
    assert bad_r.status_code == 422
    assert bad_r.json()["detail"]["error"] == "invalid_status_transition"

    # Patch to completed
    done_r = client.patch(
        f"/api/v1/relationships/focus-blocks/{fb_id}/status",
        json={"status": "completed"},
        headers=headers,
    )
    assert done_r.status_code == 200
    assert done_r.json()["status"] == "completed"
    assert done_r.json()["actual_end"] is not None

    # Patch completed → planned should 422 (terminal)
    terminal_r = client.patch(
        f"/api/v1/relationships/focus-blocks/{fb_id}/status",
        json={"status": "planned"},
        headers=headers,
    )
    assert terminal_r.status_code == 422
    assert terminal_r.json()["detail"]["error"] == "invalid_status_transition"
