def _auth_headers(client):
    response = client.post(
        "/api/v1/auth/signup",
        json={"name": "Snapshot User", "email": "snapshot@example.com", "password": "Password123!"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_generate_daily_snapshot_collects_user_state(client):
    headers = _auth_headers(client)

    goal_response = client.post(
        "/api/v1/goals",
        json={"title": "Launch HELIOS", "status": "active"},
        headers=headers,
    )
    assert goal_response.status_code == 201
    goal_id = goal_response.json()["id"]

    planned_task = client.post(
        "/api/v1/tasks",
        json={
            "title": "Study D278",
            "status": "todo",
            "priority": "high",
            "due_date": "2026-06-24T16:00:00Z",
            "linked_goal_id": goal_id,
        },
        headers=headers,
    )
    assert planned_task.status_code == 201

    completed_task = client.post(
        "/api/v1/tasks",
        json={
            "title": "Complete morning review",
            "status": "done",
            "priority": "medium",
            "due_date": "2026-06-24T09:00:00Z",
            "linked_goal_id": goal_id,
        },
        headers=headers,
    )
    assert completed_task.status_code == 201

    event_response = client.post(
        "/api/v1/calendar/events",
        json={
            "title": "D278 Study Block",
            "start_time": "2026-06-24T18:00:00Z",
            "end_time": "2026-06-24T19:30:00Z",
        },
        headers=headers,
    )
    assert event_response.status_code == 201

    focus_block_response = client.post(
        "/api/v1/relationships/focus-blocks",
        json={
            "title": "Deep Study Focus",
            "start_time": "2026-06-24T20:00:00Z",
            "end_time": "2026-06-24T21:00:00Z",
            "linked_goal_id": goal_id,
            "task_ids": [planned_task.json()["id"]],
            "source": "manual",
        },
        headers=headers,
    )
    assert focus_block_response.status_code == 201

    snapshot_response = client.post(
        "/api/v1/calendar/daily-snapshots/generate",
        json={
            "snapshot_date": "2026-06-24",
            "daily_brief": {"summary": "Focus on D278."},
            "assistant_activity": [{"type": "chat", "summary": "Reviewed plan."}],
            "connected_service_sync": {"calendar": "mock"},
            "notes": "Generated in test.",
        },
        headers=headers,
    )

    assert snapshot_response.status_code == 200
    snapshot = snapshot_response.json()
    assert snapshot["snapshot_date"] == "2026-06-24"
    assert [task["title"] for task in snapshot["tasks_planned"]] == ["Study D278"]
    assert [task["title"] for task in snapshot["tasks_completed"]] == ["Complete morning review"]
    event_titles = [event["title"] for event in snapshot["calendar_events"]]
    assert "D278 Study Block" in event_titles
    assert [block["title"] for block in snapshot["focus_blocks"]] == ["Deep Study Focus"]
    assert snapshot["active_goals"][0]["title"] == "Launch HELIOS"
    assert snapshot["goal_progress"][0]["progress"] == 50
    assert snapshot["daily_brief"]["summary"] == "Focus on D278."
    assert snapshot["assistant_activity"][0]["summary"] == "Reviewed plan."
    assert snapshot["connected_service_sync"]["calendar"] == "mock"
    assert snapshot["notes"] == "Generated in test."

    get_response = client.get("/api/v1/calendar/daily-snapshots/2026-06-24", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["id"] == snapshot["id"]


def test_generate_does_not_overwrite_existing_snapshot_without_regenerate(client):
    headers = _auth_headers(client)

    first = client.post(
        "/api/v1/calendar/daily-snapshots/generate",
        json={"snapshot_date": "2026-06-24", "notes": "original"},
        headers=headers,
    )
    assert first.status_code == 200

    second = client.post(
        "/api/v1/calendar/daily-snapshots/generate",
        json={"snapshot_date": "2026-06-24", "notes": "changed"},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["notes"] == "original"

    regenerated = client.post(
        "/api/v1/calendar/daily-snapshots/generate",
        json={"snapshot_date": "2026-06-24", "regenerate": True, "notes": "changed"},
        headers=headers,
    )
    assert regenerated.status_code == 200
    assert regenerated.json()["id"] == first.json()["id"]
    assert regenerated.json()["notes"] == "changed"


def test_upsert_and_range_daily_snapshots(client):
    headers = _auth_headers(client)

    upsert = client.put(
        "/api/v1/calendar/daily-snapshots/2026-06-24",
        json={
            "snapshot_date": "2026-06-24",
            "tasks_completed": [{"title": "Manual completion"}],
            "notes": "Manual snapshot.",
        },
        headers=headers,
    )
    assert upsert.status_code == 200
    assert upsert.json()["tasks_completed"][0]["title"] == "Manual completion"

    range_response = client.get(
        "/api/v1/calendar/daily-snapshots?start_date=2026-06-01&end_date=2026-06-30",
        headers=headers,
    )
    assert range_response.status_code == 200
    assert range_response.json()["total"] == 1
    assert range_response.json()["snapshots"][0]["snapshot_date"] == "2026-06-24"


def test_daily_snapshots_require_auth(client):
    response = client.get("/api/v1/calendar/daily-snapshots/2026-06-24")
    assert response.status_code == 401
