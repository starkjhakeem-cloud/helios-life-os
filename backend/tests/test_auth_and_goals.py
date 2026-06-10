import uuid


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
    assert signup_data["access_token"]

    token = signup_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me_response = client.get("/api/v1/auth/me", headers=headers)
    assert me_response.status_code == 200
    assert me_response.json()["email"] == signup_payload["email"]

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


def test_protected_route_requires_auth(client):
    response = client.get("/api/v1/goals")
    assert response.status_code == 401


def test_login_fails_with_wrong_credentials(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing.user@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."
