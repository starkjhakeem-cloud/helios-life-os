import calendar
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select

from app.models.calendar import CalendarEvent
from app.models.daily_history import DailyHistory
from app.models.goal import Goal
from app.models.task import Task
from app.models.user import User


def _auth_headers(db, email: str = "history@example.com") -> tuple[dict[str, str], str]:
    from app.core.jwt import create_access_token
    from app.core.security import hash_password

    now = datetime.now(timezone.utc)
    user_id = str(uuid.uuid4())
    db.add(
        User(
            id=user_id,
            name="History Test User",
            email=email,
            hashed_password=hash_password("TestPass123!"),
            created_at=now,
        )
    )
    db.commit()
    return {"Authorization": f"Bearer {create_access_token(user_id)}"}, user_id


def _day_datetime(day: date, hour: int = 9) -> datetime:
    return datetime.combine(day, time(hour=hour), tzinfo=timezone.utc)


def _day_iso(day: date, hour: int = 9) -> str:
    return _day_datetime(day, hour).isoformat().replace("+00:00", "Z")


def _seed_day_state(db, user_id: str, target_date: date) -> None:
    now = datetime.now(timezone.utc)
    goal_id = str(uuid.uuid4())
    db.add(
        Goal(
            id=goal_id,
            user_id=user_id,
            title="Launch HELIOS",
            description="Ship the first production-ready assistant.",
            status="active",
            target_date=target_date.isoformat(),
            created_at=now,
            updated_at=now,
        )
    )
    db.add_all(
        [
            Task(
                id=str(uuid.uuid4()),
                user_id=user_id,
                title="Complete D278 study block",
                description="Finish the planned study session.",
                status="done",
                priority="high",
                due_date=_day_iso(target_date, 10),
                linked_goal_id=goal_id,
                created_at=_day_datetime(target_date, 8),
                updated_at=_day_datetime(target_date, 11),
            ),
            Task(
                id=str(uuid.uuid4()),
                user_id=user_id,
                title="Plan HELIOS build session",
                description="Prepare the next development block.",
                status="todo",
                priority="medium",
                due_date=_day_iso(target_date, 16),
                linked_goal_id=goal_id,
                created_at=now,
                updated_at=now,
            ),
            Task(
                id=str(uuid.uuid4()),
                user_id=user_id,
                title="Clean up old notes",
                description=None,
                status="todo",
                priority="low",
                due_date=_day_iso(target_date - timedelta(days=1), 16),
                linked_goal_id=None,
                created_at=now,
                updated_at=now,
            ),
        ]
    )
    db.add(
        CalendarEvent(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title="D278 Study Block",
            description="Focused study time.",
            start_time=_day_iso(target_date, 18),
            end_time=_day_iso(target_date, 20),
            location=None,
            source="manual",
            external_event_id=None,
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()


def test_generate_history_day_collects_state_and_can_be_read(client, db):
    headers, user_id = _auth_headers(db)
    target_date = datetime.now(timezone.utc).date()
    _seed_day_state(db, user_id, target_date)

    response = client.post(
        f"/api/v1/history/day/{target_date.isoformat()}/generate",
        headers=headers,
        json={
            "daily_brief": {"summary": "Prioritize D278 and HELIOS work."},
            "focus_blocks": [{"title": "Deep Work", "duration_minutes": 90}],
            "assistant_activity": [{"type": "chat", "summary": "Built a study plan."}],
            "integration_activity": [{"provider": "google", "status": "synced"}],
            "notes": "Strong focus day.",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == target_date.isoformat()
    assert body["daily_brief"]["summary"] == "Prioritize D278 and HELIOS work."
    assert [task["title"] for task in body["completed_tasks"]] == ["Complete D278 study block"]
    assert [task["title"] for task in body["planned_tasks"]] == ["Plan HELIOS build session"]
    assert [task["title"] for task in body["overdue_tasks"]] == ["Clean up old notes"]
    assert [event["title"] for event in body["calendar_events"]] == ["D278 Study Block"]
    assert body["goals_snapshot"][0]["title"] == "Launch HELIOS"
    assert body["goals_snapshot"][0]["progress"] == 50
    assert body["focus_blocks"][0]["duration_minutes"] == 90

    get_response = client.get(f"/api/v1/history/day/{target_date.isoformat()}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["id"] == body["id"]


def test_history_range_and_month_summaries(client, db):
    headers, user_id = _auth_headers(db, email="history-range@example.com")
    target_date = datetime.now(timezone.utc).date()
    _seed_day_state(db, user_id, target_date)

    generate = client.post(
        f"/api/v1/history/day/{target_date.isoformat()}/generate",
        headers=headers,
        json={
            "focus_blocks": [{"title": "Creative Session", "duration_minutes": 60}],
            "notes": "Photography and recovery work.",
        },
    )
    assert generate.status_code == 200

    range_response = client.get(
        f"/api/v1/history/range?start_date={target_date.replace(day=1).isoformat()}&end_date={target_date.isoformat()}",
        headers=headers,
    )
    assert range_response.status_code == 200
    assert range_response.json()["total"] == 1

    month_response = client.get(
        f"/api/v1/history/month?year={target_date.year}&month={target_date.month}",
        headers=headers,
    )
    assert month_response.status_code == 200
    month_body = month_response.json()
    assert month_body["total"] == calendar.monthrange(target_date.year, target_date.month)[1]
    selected = next(day for day in month_body["days"] if day["date"] == target_date.isoformat())
    assert selected["has_events"] is True
    assert selected["has_tasks"] is True
    assert selected["has_focus"] is True
    assert selected["has_personal"] is True
    assert selected["focus_minutes"] == 60
    assert selected["activity_level"] == "high"


def test_history_upserts_one_row_per_user_and_date(client, db):
    headers, user_id = _auth_headers(db, email="history-upsert@example.com")
    target_date = datetime.now(timezone.utc).date() + timedelta(days=3)

    first = client.post(
        f"/api/v1/history/day/{target_date.isoformat()}/generate",
        headers=headers,
        json={"notes": "First future plan."},
    )
    assert first.status_code == 200

    second = client.post(
        f"/api/v1/history/day/{target_date.isoformat()}/generate",
        headers=headers,
        json={"notes": "Updated future plan."},
    )
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["notes"] == "Updated future plan."

    rows = db.execute(
        select(DailyHistory).where(
            DailyHistory.user_id == user_id,
            DailyHistory.history_date == target_date,
        )
    ).scalars().all()
    assert len(rows) == 1


def test_locked_past_history_is_preserved_without_regenerate(client, db):
    headers, _user_id = _auth_headers(db, email="history-lock@example.com")
    past_date = datetime.now(timezone.utc).date() - timedelta(days=1)

    first = client.post(
        f"/api/v1/history/day/{past_date.isoformat()}/generate",
        headers=headers,
        json={"notes": "Original historical record."},
    )
    assert first.status_code == 200

    lock = client.post(f"/api/v1/history/day/{past_date.isoformat()}/lock", headers=headers)
    assert lock.status_code == 200
    assert lock.json()["status"] == "locked"

    preserved = client.post(
        f"/api/v1/history/day/{past_date.isoformat()}/generate",
        headers=headers,
        json={"notes": "Should not overwrite."},
    )
    assert preserved.status_code == 200
    assert preserved.json()["id"] == first.json()["id"]
    assert preserved.json()["notes"] == "Original historical record."
    assert preserved.json()["status"] == "locked"

    regenerated = client.post(
        f"/api/v1/history/day/{past_date.isoformat()}/generate",
        headers=headers,
        json={"regenerate": True, "notes": "Explicitly regenerated."},
    )
    assert regenerated.status_code == 200
    assert regenerated.json()["id"] == first.json()["id"]
    assert regenerated.json()["notes"] == "Explicitly regenerated."


def test_future_history_updates_until_day_passes(client, db):
    headers, user_id = _auth_headers(db, email="history-future@example.com")
    future_date = datetime.now(timezone.utc).date() + timedelta(days=7)

    first = client.post(f"/api/v1/history/day/{future_date.isoformat()}/generate", headers=headers)
    assert first.status_code == 200
    assert first.json()["status"] == "planned"
    assert first.json()["planned_tasks"] == []

    db.add(
        Task(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title="Future planning task",
            description=None,
            status="todo",
            priority="medium",
            due_date=_day_iso(future_date, 14),
            linked_goal_id=None,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    updated = client.post(f"/api/v1/history/day/{future_date.isoformat()}/generate", headers=headers)
    assert updated.status_code == 200
    assert [task["title"] for task in updated.json()["planned_tasks"]] == ["Future planning task"]


def test_history_is_scoped_to_current_user(client, db):
    headers_one, _user_one = _auth_headers(db, email="history-one@example.com")
    headers_two, _user_two = _auth_headers(db, email="history-two@example.com")
    target_date = datetime.now(timezone.utc).date()

    created = client.post(f"/api/v1/history/day/{target_date.isoformat()}/generate", headers=headers_one)
    assert created.status_code == 200

    forbidden_lookup = client.get(f"/api/v1/history/day/{target_date.isoformat()}", headers=headers_two)
    assert forbidden_lookup.status_code == 404
