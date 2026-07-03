from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.jwt import create_access_token
from app.core.security import hash_password
from app.models.calendar import CalendarEvent
from app.models.email import EmailMessage
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User
from app.services.priority_engine import EmailPriorityClassifier, PriorityEngine


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_user(db: Session) -> tuple[str, User]:
    user = User(
        id=str(uuid.uuid4()),
        name="Priority User",
        email=f"priority-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=_now(),
    )
    db.add(user)
    db.flush()
    return create_access_token(user.id), user


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _email(
    db: Session,
    user_id: str,
    *,
    sender: str,
    subject: str,
    snippet: str,
    importance: str = "normal",
    labels: list[str] | None = None,
) -> EmailMessage:
    message = EmailMessage(
        id=str(uuid.uuid4()),
        user_id=user_id,
        sender=sender,
        subject=subject,
        snippet=snippet,
        received_at=_now().isoformat(),
        importance=importance,
        status="unread",
        source="gmail",
        external_message_id=str(uuid.uuid4()),
        labels=labels or ["INBOX"],
        raw_metadata={"body": "RAW BODY MUST NOT LEAK"},
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(message)
    return message


def _goal(db: Session, user_id: str, title: str = "Finish WGU term") -> Goal:
    goal = Goal(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        status="active",
        priority="high",
        target_date=(date.today() + timedelta(days=10)).isoformat(),
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(goal)
    return goal


def _task(
    db: Session,
    user_id: str,
    *,
    title: str,
    priority: str = "medium",
    due_date: str | None = None,
    duration: int = 30,
    goal_id: str | None = None,
) -> Task:
    task = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        status="todo",
        priority=priority,
        due_date=due_date,
        estimated_duration_minutes=duration,
        linked_goal_id=goal_id,
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(task)
    return task


def _event(
    db: Session,
    user_id: str,
    *,
    title: str,
    start: datetime,
    end: datetime,
) -> CalendarEvent:
    event = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=title,
        start_time=start.isoformat(),
        end_time=end.isoformat(),
        source="manual",
        created_at=_now(),
        updated_at=_now(),
    )
    db.add(event)
    return event


def test_email_classifier_downgrades_promotions_even_when_unread_and_important(db: Session):
    _token, user = _make_user(db)
    promo = _email(
        db,
        user.id,
        sender="deals@shop.example",
        subject="Limited time offer: 50% off",
        snippet="Coupon, sale, shopping newsletter. Unsubscribe here.",
        importance="urgent",
        labels=["INBOX", "IMPORTANT", "CATEGORY_PROMOTIONS"],
    )
    security = _email(
        db,
        user.id,
        sender="no-reply@apple.com",
        subject="Apple Developer security alert",
        snippet="Action required: verify your Apple Developer account password change.",
        importance="normal",
    )
    db.commit()

    classifier = EmailPriorityClassifier()
    assert classifier.classify(promo)["priority"] == "low"
    assert classifier.classify(security)["priority"] == "high"


def test_daily_brief_and_task_suggestions_ignore_promotional_email(client, db: Session):
    token, user = _make_user(db)
    _email(
        db,
        user.id,
        sender="newsletter@store.example",
        subject="Weekend coupon newsletter",
        snippet="Promotion, shopping discounts, unsubscribe.",
        importance="urgent",
        labels=["INBOX", "IMPORTANT", "CATEGORY_PROMOTIONS"],
    )
    _email(
        db,
        user.id,
        sender="advisor@wgu.edu",
        subject="WGU enrollment action required",
        snippet="Please review your enrollment deadline today.",
        importance="normal",
    )
    db.commit()

    brief = client.post("/api/v1/daily-brief/generate", headers=_auth(token), json={})
    assert brief.status_code == 200, brief.text
    brief_text = str(brief.json())
    assert "WGU enrollment action required" in brief_text
    assert "Weekend coupon newsletter" not in brief_text
    assert "RAW BODY MUST NOT LEAK" not in brief_text

    suggestions = client.post(
        "/api/v1/task-engine/suggestions/generate",
        headers=_auth(token),
        json={"sources": ["gmail"], "limit": 10},
    )
    assert suggestions.status_code == 200, suggestions.text
    suggestion_text = str(suggestions.json())
    assert "WGU enrollment action required" in suggestion_text
    assert "Weekend coupon newsletter" not in suggestion_text


def test_next_best_action_is_consistent_across_daily_brief_and_relationship_api(client, db: Session):
    token, user = _make_user(db)
    goal = _goal(db, user.id, "Graduate from WGU")
    _task(
        db,
        user.id,
        title="Submit WGU assessment",
        priority="high",
        due_date=(date.today() - timedelta(days=1)).isoformat(),
        duration=45,
        goal_id=goal.id,
    )
    _email(
        db,
        user.id,
        sender="marketing@example.com",
        subject="Coupon digest",
        snippet="Newsletter promotion sale unsubscribe.",
        importance="urgent",
        labels=["CATEGORY_PROMOTIONS"],
    )
    db.commit()

    brief = client.get("/api/v1/daily-brief/today", headers=_auth(token))
    nba = client.get("/api/v1/relationships/next-best-action", headers=_auth(token))
    suggestions = client.post(
        "/api/v1/task-engine/suggestions/generate",
        headers=_auth(token),
        json={"sources": ["next_best_action"], "limit": 5},
    )

    assert brief.status_code == 200, brief.text
    assert nba.status_code == 200, nba.text
    assert suggestions.status_code == 200, suggestions.text
    assert brief.json()["next_best_action"]["title"] == "Submit WGU assessment"
    assert nba.json()["title"] == "Submit WGU assessment"
    assert suggestions.json()["next_best_action"]["title"] == "Submit WGU assessment"


def test_build_day_automatically_schedules_ranked_tasks_around_calendar(client, db: Session):
    token, user = _make_user(db)
    target = date.today() + timedelta(days=1)
    meeting_start = datetime(target.year, target.month, target.day, 10, 0, tzinfo=timezone.utc)
    _event(
        db,
        user.id,
        title="Existing meeting",
        start=meeting_start,
        end=meeting_start + timedelta(hours=1),
    )
    urgent = _task(
        db,
        user.id,
        title="Critical launch work",
        priority="critical",
        due_date=target.isoformat(),
        duration=60,
    )
    _task(
        db,
        user.id,
        title="Low priority admin",
        priority="low",
        due_date=target.isoformat(),
        duration=30,
    )
    db.commit()

    response = client.post(
        "/api/v1/task-engine/build-day",
        headers=_auth(token),
        json={"date": target.isoformat(), "commit": True, "max_items": 4},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["committed"] is True
    assert body["summary"]
    assert body["primaryFocus"] == "Critical launch work"
    assert body["scheduleBlocks"]
    assert body["scheduled_items"]
    first = body["scheduled_items"][0]
    assert first["linked_task_id"] == urgent.id
    assert first["start_time"] < meeting_start.isoformat()
    task_blocks = [block for block in body["scheduleBlocks"] if block["type"] == "task"]
    assert task_blocks[0]["sourceId"] == urgent.id
    assert task_blocks[0]["endTime"] <= meeting_start.isoformat()
    db.expire_all()
    assert db.get(Task, urgent.id).scheduled_start is not None


def test_build_day_preview_works_without_manual_input(client, db: Session):
    token, user = _make_user(db)
    task = _task(
        db,
        user.id,
        title="Prepare executive brief",
        priority="high",
        due_date=date.today().isoformat(),
        duration=45,
    )
    db.commit()

    response = client.post(
        "/api/v1/task-engine/build-day",
        headers=_auth(token),
        json={},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["committed"] is True
    assert body["summary"]
    assert body["primaryFocus"] == "Prepare executive brief"
    assert any(block["sourceId"] == task.id for block in body["scheduleBlocks"])
    assert body["topTasks"][0]["id"] == task.id


def test_build_day_preview_does_not_commit_when_requested(db: Session):
    _token, user = _make_user(db)
    target = date.today() + timedelta(days=1)
    task = _task(
        db,
        user.id,
        title="Preview-only task",
        priority="high",
        due_date=target.isoformat(),
        duration=30,
    )
    db.commit()

    plan = PriorityEngine(db).build_day_schedule(user.id, target, commit=False)

    assert plan["committed"] is False
    assert any(block["sourceId"] == task.id for block in plan["scheduleBlocks"])
    db.expire_all()
    assert db.get(Task, task.id).scheduled_start is None


def test_build_day_orders_overdue_tasks_before_optional_work(db: Session):
    _token, user = _make_user(db)
    overdue = _task(
        db,
        user.id,
        title="Overdue certification task",
        priority="medium",
        due_date=(date.today() - timedelta(days=2)).isoformat(),
        duration=30,
    )
    optional = _task(db, user.id, title="Optional cleanup", priority="low", duration=30)
    db.commit()

    plan = PriorityEngine(db).build_day_schedule(user.id, date.today(), commit=False)
    task_blocks = [block for block in plan["scheduleBlocks"] if block["type"] == "task"]

    assert task_blocks
    assert task_blocks[0]["sourceId"] == overdue.id
    assert any(block["sourceId"] == optional.id for block in task_blocks)


def test_build_day_active_goal_without_tasks_creates_planning_block(db: Session):
    _token, user = _make_user(db)
    goal = _goal(db, user.id, "Launch HELIOS V3")
    db.commit()

    plan = PriorityEngine(db).build_day_schedule(user.id, date.today(), commit=False)
    planning_blocks = [block for block in plan["scheduleBlocks"] if block["type"] == "planning"]

    assert any(block.get("sourceId") == goal.id for block in planning_blocks)
    assert "Launch HELIOS V3" in str(planning_blocks)


def test_build_day_excludes_promotional_email_and_includes_important_email(db: Session):
    _token, user = _make_user(db)
    important = _email(
        db,
        user.id,
        sender="notifications@github.com",
        subject="Review requested on pull request",
        snippet="Action required: please review this GitHub pull request.",
    )
    _email(
        db,
        user.id,
        sender="deals@store.example",
        subject="Weekend coupon newsletter",
        snippet="Promotion, sale, shopping, unsubscribe.",
        importance="urgent",
        labels=["CATEGORY_PROMOTIONS", "IMPORTANT"],
    )
    db.commit()

    plan = PriorityEngine(db).build_day_schedule(user.id, date.today(), commit=False)
    plan_text = str(plan)

    assert important.subject in plan_text
    assert "Weekend coupon newsletter" not in plan_text
    assert any(block["type"] == "email" and block["sourceId"] == important.id for block in plan["scheduleBlocks"])


def test_build_day_fully_booked_day_returns_constrained_plan(db: Session):
    _token, user = _make_user(db)
    target = date.today() + timedelta(days=1)
    _event(
        db,
        user.id,
        title="All-day onsite",
        start=datetime(target.year, target.month, target.day, 8, 0, tzinfo=timezone.utc),
        end=datetime(target.year, target.month, target.day, 22, 0, tzinfo=timezone.utc),
    )
    task = _task(
        db,
        user.id,
        title="Critical follow-up",
        priority="critical",
        due_date=target.isoformat(),
        duration=45,
    )
    db.commit()

    plan = PriorityEngine(db).build_day_schedule(user.id, target, commit=False)

    assert plan["scheduleBlocks"]
    assert plan["windows_remaining"] == []
    assert any("fully booked" in warning for warning in plan["warnings"])
    untimed = [block for block in plan["scheduleBlocks"] if block.get("sourceId") == task.id]
    assert untimed and "startTime" not in untimed[0]


def test_build_day_empty_data_returns_starter_plan(db: Session):
    _token, user = _make_user(db)
    target = date.today() + timedelta(days=1)
    db.commit()

    plan = PriorityEngine(db).build_day_schedule(user.id, target, commit=False)

    assert plan["summary"]
    assert plan["primaryFocus"] == "Choose today's primary focus"
    assert any(block["type"] == "planning" for block in plan["scheduleBlocks"])
    assert any(block["type"] == "focus" for block in plan["scheduleBlocks"])
    assert any("No tasks" in warning for warning in plan["warnings"])


def test_assistant_context_uses_priority_engine_and_filtered_email(db: Session):
    from app.ai.assistant_context_service import AssistantContextService

    _token, user = _make_user(db)
    _email(
        db,
        user.id,
        sender="newsletter@example.com",
        subject="Shopping newsletter coupon",
        snippet="Promotion sale unsubscribe.",
        importance="urgent",
        labels=["CATEGORY_PROMOTIONS"],
    )
    _email(
        db,
        user.id,
        sender="notifications@github.com",
        subject="Review requested on pull request",
        snippet="Action required: please review the GitHub pull request.",
        importance="normal",
    )
    db.commit()

    ctx = AssistantContextService(db).build_context_for_message(user.id, "What should I work on?", context_type="general")
    prompt = AssistantContextService(db).summarize_context_for_prompt(ctx)

    assert ctx["priority_intelligence"]["next_best_action"]["title"]
    assert "Review requested on pull request" in str(ctx)
    assert "Shopping newsletter coupon" not in str(ctx)
    assert "PRIORITY ENGINE:" in prompt


def test_assistant_build_my_day_intent_uses_shared_plan(db: Session):
    from app.ai.assistant_context_service import AssistantContextService

    _token, user = _make_user(db)
    task = _task(
        db,
        user.id,
        title="Finish HELIOS plan",
        priority="high",
        due_date=date.today().isoformat(),
        duration=45,
    )
    db.commit()

    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(user.id, "Plan my day", context_type="general")
    prompt = svc.summarize_context_for_prompt(ctx)

    assert ctx["build_my_day_plan"]["primaryFocus"] == "Finish HELIOS plan"
    assert any(block.get("sourceId") == task.id for block in ctx["build_my_day_plan"]["scheduleBlocks"])
    assert "BUILD MY DAY PLAN:" in prompt


def test_overdue_task_beats_generic_goal_recovery(db: Session):
    _token, user = _make_user(db)
    _goal(db, user.id, "Generic goal without next task")
    overdue = _task(
        db,
        user.id,
        title="Finish overdue assessment",
        priority="high",
        due_date=(date.today() - timedelta(days=1)).isoformat(),
        duration=45,
    )
    db.commit()

    recommendations = PriorityEngine(db).build_priority_context(user.id)["recommendations"]

    assert recommendations[0]["type"] == "task"
    assert recommendations[0]["sourceIds"]["taskId"] == overdue.id
    assert recommendations[0]["score"] > next(item["score"] for item in recommendations if item["type"] == "recovery")


def test_due_today_task_beats_low_value_email(db: Session):
    _token, user = _make_user(db)
    due_today = _task(
        db,
        user.id,
        title="Submit task due today",
        priority="medium",
        due_date=date.today().isoformat(),
        duration=30,
    )
    _email(
        db,
        user.id,
        sender="deals@shop.example",
        subject="Huge coupon newsletter",
        snippet="Promotion sale shopping unsubscribe.",
        importance="urgent",
        labels=["INBOX", "IMPORTANT", "CATEGORY_PROMOTIONS"],
    )
    db.commit()

    recommendations = PriorityEngine(db).build_priority_context(user.id)["recommendations"]

    assert recommendations[0]["sourceIds"]["taskId"] == due_today.id
    assert "Huge coupon newsletter" not in str(recommendations)


def test_important_apple_developer_email_generates_email_recommendation(db: Session):
    _token, user = _make_user(db)
    message = _email(
        db,
        user.id,
        sender="developer@apple.com",
        subject="Apple Developer Program action required",
        snippet="Please review this Apple Developer account message before deployment.",
        importance="normal",
    )
    db.commit()

    recommendations = PriorityEngine(db).build_priority_context(user.id)["recommendations"]
    email_recs = [item for item in recommendations if item["type"] == "email"]

    assert email_recs
    assert email_recs[0]["sourceIds"]["emailId"] == message.id
    assert email_recs[0]["action"]["route"] == "/(tabs)/email"


def test_active_goal_with_no_tasks_generates_recovery_recommendation(db: Session):
    _token, user = _make_user(db)
    goal = _goal(db, user.id, "Graduate from WGU")
    db.commit()

    recommendations = PriorityEngine(db).build_priority_context(user.id)["recommendations"]
    recovery = [item for item in recommendations if item["type"] == "recovery"]

    assert recovery
    assert recovery[0]["sourceIds"]["goalId"] == goal.id
    assert recovery[0]["action"]["operation"] == "create_goal_task"


def test_free_calendar_window_generates_planning_recommendation(db: Session):
    _token, user = _make_user(db)
    now = datetime(2026, 7, 2, 8, 0, tzinfo=timezone.utc)
    _task(db, user.id, title="Open focus task", priority="medium", due_date="2026-07-02", duration=30)
    _event(
        db,
        user.id,
        title="Afternoon meeting",
        start=datetime(2026, 7, 2, 12, 0, tzinfo=timezone.utc),
        end=datetime(2026, 7, 2, 13, 0, tzinfo=timezone.utc),
    )
    db.commit()

    recommendations = PriorityEngine(db, now=now).build_priority_context(user.id, now.date())["recommendations"]
    planning = [item for item in recommendations if item["type"] == "planning"]

    assert planning
    assert planning[0]["action"]["operation"] == "build_day"
    assert planning[0]["effortMinutes"] >= 45


def test_recommendations_sorted_by_score_and_include_action_target(db: Session):
    _token, user = _make_user(db)
    _task(
        db,
        user.id,
        title="Critical overdue work",
        priority="critical",
        due_date=(date.today() - timedelta(days=2)).isoformat(),
        duration=30,
    )
    _task(db, user.id, title="Nice to have", priority="low", duration=30)
    db.commit()

    recommendations = PriorityEngine(db).build_priority_context(user.id)["recommendations"]
    scores = [item["score"] for item in recommendations]

    assert scores == sorted(scores, reverse=True)
    assert all(item["action"].get("label") for item in recommendations)
    assert all(item["action"].get("route") for item in recommendations)
