import uuid


def _signup(client):
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Username User",
            "email": f"username-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
        },
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_saving_same_user_id_does_not_consume_change_slot(client):
    headers = _signup(client)

    initial = client.patch(
        "/api/v1/profile/user-id",
        json={"value": "first.handle"},
        headers=headers,
    )
    assert initial.status_code == 200
    body = initial.json()
    assert body["custom_user_id"] == "first.handle"
    assert body["user_id_changed"] is False
    assert body["can_change_user_id"] is True

    same = client.patch(
        "/api/v1/profile/user-id",
        json={"value": "first.handle"},
        headers=headers,
    )
    assert same.status_code == 200
    body = same.json()
    assert body["custom_user_id"] == "first.handle"
    assert body["user_id_changed"] is False
    assert body["can_change_user_id"] is True

    changed = client.patch(
        "/api/v1/profile/user-id",
        json={"value": "second.handle"},
        headers=headers,
    )
    assert changed.status_code == 200
    body = changed.json()
    assert body["custom_user_id"] == "second.handle"
    assert body["user_id_changed"] is True
    assert body["can_change_user_id"] is False
