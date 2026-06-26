import uuid


def _signup(client):
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Display Name User",
            "email": f"display-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
        },
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_display_name_initial_setup_is_free_then_two_changes_allowed(client):
    headers = _signup(client)

    initial = client.patch(
        "/api/v1/profile",
        json={"display_name": "Initial Name"},
        headers=headers,
    )
    assert initial.status_code == 200
    body = initial.json()
    assert body["display_name"] == "Initial Name"
    assert body["display_name_change_count"] == 0
    assert body["display_name_changes_remaining"] == 2
    assert body["can_change_display_name"] is True

    first_change = client.patch(
        "/api/v1/profile",
        json={"display_name": "Second Name"},
        headers=headers,
    )
    assert first_change.status_code == 200
    body = first_change.json()
    assert body["display_name"] == "Second Name"
    assert body["display_name_change_count"] == 1
    assert body["display_name_changes_remaining"] == 1
    assert body["can_change_display_name"] is True
    assert body["display_name_changed_at"] is not None

    second_change = client.patch(
        "/api/v1/profile",
        json={"display_name": "Final Name"},
        headers=headers,
    )
    assert second_change.status_code == 200
    body = second_change.json()
    assert body["display_name"] == "Final Name"
    assert body["display_name_change_count"] == 2
    assert body["display_name_changes_remaining"] == 0
    assert body["can_change_display_name"] is False

    rejected = client.patch(
        "/api/v1/profile",
        json={"display_name": "Too Many Names"},
        headers=headers,
    )
    assert rejected.status_code == 422
    assert "changed twice" in rejected.json()["detail"]


def test_saving_same_display_name_does_not_consume_change(client):
    headers = _signup(client)

    first = client.patch(
        "/api/v1/profile",
        json={"display_name": "Same Name"},
        headers=headers,
    )
    assert first.status_code == 200

    same = client.patch(
        "/api/v1/profile",
        json={"display_name": "Same Name"},
        headers=headers,
    )
    assert same.status_code == 200
    assert same.json()["display_name_change_count"] == 0
    assert same.json()["display_name_changes_remaining"] == 2
