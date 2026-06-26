import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings


def test_signup_login_and_goal_workflow(client):
    signup_payload = {
        "name": "Test User",
        "email": "test.user@example.com",
        "password": "Password123!",
    }

    signup_response = client.post("/api/v1/auth/signup", json=signup_payload)
    assert signup_response.status_code == 201
    signup_data = signup_response.json()
    assert signup_data["user"]["email"] == signup_payload["email"]
    assert "hashed_password" not in signup_data["user"]
    assert "password" not in signup_data["user"]
    assert signup_data["access_token"]
    assert signup_data["refresh_token"]

    token = signup_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_response = client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["email"] == signup_payload["email"]
    assert "hashed_password" not in me_response.json()

    preferences_response = client.get("/api/v1/settings/preferences", headers=headers)
    assert preferences_response.status_code == 200
    assert preferences_response.json()["location"] == "New York"

    location_response = client.patch(
        "/api/v1/settings/preferences",
        json={"location": "Brooklyn"},
        headers=headers,
    )
    assert location_response.status_code == 200
    assert location_response.json()["location"] == "Brooklyn"

    email_response = client.post(
        "/api/v1/email",
        json={
            "sender": "updates@example.com",
            "subject": "Recoverable message",
            "received_at": "2026-06-22T18:30:00Z",
        },
        headers=headers,
    )
    assert email_response.status_code == 201
    email_id = email_response.json()["id"]

    trash_response = client.patch(
        f"/api/v1/email/{email_id}",
        json={"status": "trashed"},
        headers=headers,
    )
    assert trash_response.status_code == 200
    assert trash_response.json()["status"] == "trashed"

    trashed_list = client.get("/api/v1/email?status=trashed", headers=headers)
    assert trashed_list.status_code == 200
    assert [message["id"] for message in trashed_list.json()["messages"]] == [email_id]

    restore_response = client.patch(
        f"/api/v1/email/{email_id}",
        json={"status": "read"},
        headers=headers,
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "read"

    goal_payload = {
        "title": "Finish user testing",
        "description": "Add reliable tests for the HELIOS backend and mobile app.",
        "status": "active",
    }
    create_response = client.post("/api/v1/goals", json=goal_payload, headers=headers)
    assert create_response.status_code == 201
    created_goal = create_response.json()
    assert created_goal["title"] == goal_payload["title"]

    goal_id = created_goal["id"]
    list_response = client.get("/api/v1/goals", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["goals"]) == 1

    update_response = client.patch(
        f"/api/v1/goals/{goal_id}",
        json={"status": "completed"},
        headers=headers,
    )
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "completed"

    delete_response = client.delete(f"/api/v1/goals/{goal_id}", headers=headers)
    assert delete_response.status_code == 204

    final_list = client.get("/api/v1/goals", headers=headers)
    assert final_list.status_code == 200
    assert final_list.json()["goals"] == []


def test_goal_detail_and_linked_tasks_are_user_scoped(client):
    owner_signup = client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Goal Owner",
            "email": f"owner-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
        },
    )
    other_signup = client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Other User",
            "email": f"other-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
        },
    )
    assert owner_signup.status_code == 201
    assert other_signup.status_code == 201

    owner_headers = {"Authorization": f"Bearer {owner_signup.json()['access_token']}"}
    other_headers = {"Authorization": f"Bearer {other_signup.json()['access_token']}"}

    goal_response = client.post(
        "/api/v1/goals",
        json={"title": "Wire app intelligence", "status": "active"},
        headers=owner_headers,
    )
    assert goal_response.status_code == 201
    goal = goal_response.json()

    task_response = client.post(
        "/api/v1/tasks",
        json={
            "title": "Finalize backend API contract",
            "priority": "high",
            "linked_goal_id": goal["id"],
        },
        headers=owner_headers,
    )
    assert task_response.status_code == 201

    detail_response = client.get(f"/api/v1/goals/{goal['id']}", headers=owner_headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == goal["id"]

    linked_tasks_response = client.get(f"/api/v1/goals/{goal['id']}/tasks", headers=owner_headers)
    assert linked_tasks_response.status_code == 200
    linked_tasks = linked_tasks_response.json()["tasks"]
    assert [task["id"] for task in linked_tasks] == [task_response.json()["id"]]

    other_detail_response = client.get(f"/api/v1/goals/{goal['id']}", headers=other_headers)
    assert other_detail_response.status_code == 404

    other_linked_tasks_response = client.get(f"/api/v1/goals/{goal['id']}/tasks", headers=other_headers)
    assert other_linked_tasks_response.status_code == 404


def test_protected_route_requires_auth(client):
    response = client.get("/api/v1/goals")
    assert response.status_code == 401


def test_protected_route_rejects_expired_access_token(client):
    expired = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

    response = client.get(
        "/api/v1/goals",
        headers={"Authorization": f"Bearer {expired}"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Your session has expired. Please sign in again."
    assert "jwt_secret" not in str(response.json()).lower()


def test_refresh_rejects_access_token(client):
    signup_response = client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Refresh Guard",
            "email": f"refresh-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
        },
    )
    assert signup_response.status_code == 201

    response = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": signup_response.json()["access_token"]},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Your session has expired. Please sign in again."


def test_login_fails_with_wrong_credentials(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing.user@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."
