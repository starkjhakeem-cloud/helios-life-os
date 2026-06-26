import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings


@pytest.fixture
def integration_token(db):
    from app.core.jwt import create_access_token
    from app.core.security import hash_password
    from app.models.user import User

    now = datetime.now(timezone.utc)
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        name="Integration Test User",
        email="integration@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=now,
    )
    db.add(user)
    db.commit()
    return create_access_token(user_id), user_id


@pytest.fixture
def google_config(monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setattr(settings, "google_client_id", "google-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "google-client-secret-value")
    monkeypatch.setattr(settings, "google_redirect_uri", "http://localhost:8000/api/v1/integrations/google/callback")
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "google_scopes", (
        "https://www.googleapis.com/auth/calendar.readonly "
        "https://www.googleapis.com/auth/gmail.readonly "
        "https://www.googleapis.com/auth/userinfo.email"
    ))


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_google_auth_url_generation(client, integration_token, google_config):
    token, _user_id = integration_token

    response = client.get(
        "/api/v1/integrations/google/auth-url?service_type=calendar",
        headers=_auth(token),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["configured"] is True
    assert data["service_type"] == "calendar"
    assert "accounts.google.com" in data["url"]
    assert "calendar.readonly" in data["url"]
    assert "gmail.readonly" not in data["url"]


def test_google_auth_url_missing_credentials(client, integration_token, monkeypatch):
    token, _user_id = integration_token
    monkeypatch.setattr(settings, "google_client_id", None)
    monkeypatch.setattr(settings, "google_client_secret", None)

    response = client.get("/api/v1/integrations/google/auth-url", headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["configured"] is False


def test_google_exchange_stores_encrypted_tokens_without_leaking_raw_values(
    client,
    db,
    integration_token,
    google_config,
    monkeypatch,
):
    from app.models.integration import UserIntegration
    from app.routers import integrations as router
    from app.services.google_oauth import GoogleAccountProfile, GoogleTokens

    token, user_id = integration_token
    sample_access = "sample-access-token"
    sample_refresh = "sample-refresh-token"
    monkeypatch.setattr(
        router,
        "exchange_authorization_code",
        lambda code, redirect_uri: GoogleTokens(
            access_token=sample_access,
            refresh_token=sample_refresh,
            expires_in=3600,
            scope="https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly",
        ),
    )
    monkeypatch.setattr(
        router,
        "fetch_google_account_profile",
        lambda access_token: GoogleAccountProfile(email="user@gmail.com", display_name="User Gmail"),
    )

    response = client.post(
        "/api/v1/integrations/google/exchange",
        headers=_auth(token),
        json={"code": "auth-code", "service_type": "both"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tokens_stored"] is True
    assert sample_access not in str(body)
    assert sample_refresh not in str(body)

    rows = db.query(UserIntegration).filter_by(user_id=user_id, provider="google").all()
    assert {row.service_type for row in rows} == {"calendar", "gmail"}
    assert all(row.access_token_encrypted != sample_access for row in rows)
    assert all(row.refresh_token_encrypted != sample_refresh for row in rows)


def test_google_callback_exchanges_code_stores_tokens_redirects_and_runs_first_sync(
    client,
    db,
    integration_token,
    google_config,
    monkeypatch,
):
    from app.models.integration import UserIntegration
    from app.models.integration_oauth_state import IntegrationOAuthState
    from app.routers import integrations as router
    from app.services.google_oauth import GoogleAccountProfile, GoogleTokens
    from app.services.token_encryption import decrypt_token

    _token, user_id = integration_token
    state = "callback-state"
    sample_access = "sample-callback-access"
    sample_refresh = "sample-callback-refresh"
    sync_calls: list[tuple[str, str]] = []
    db.add(IntegrationOAuthState(
        state=state,
        user_id=user_id,
        provider="google",
        service_type="calendar",
        scopes="[]",
        redirect_uri="http://localhost:8000/api/v1/integrations/google/callback",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        created_at=datetime.now(timezone.utc),
    ))
    db.commit()

    monkeypatch.setattr(
        router,
        "exchange_authorization_code",
        lambda code, redirect_uri: GoogleTokens(
            access_token=sample_access,
            refresh_token=sample_refresh,
            expires_in=3600,
            scope="https://www.googleapis.com/auth/calendar.readonly",
        ),
    )
    monkeypatch.setattr(
        router,
        "fetch_google_account_profile",
        lambda access_token: GoogleAccountProfile(email="callback@gmail.com", display_name="Callback User"),
    )
    monkeypatch.setattr(
        router,
        "sync_google",
        lambda user_id_arg, service_type_arg, db_arg: sync_calls.append((user_id_arg, service_type_arg)) or [],
    )

    response = client.get(
        f"/api/v1/integrations/google/callback?code=abc&state={state}",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"].startswith("helios://oauth/google?success=true")
    assert "services=calendar" in response.headers["location"]
    assert sample_access not in response.headers["location"]
    assert sample_refresh not in response.headers["location"]
    assert sync_calls == [(user_id, "calendar")]
    account = db.query(UserIntegration).filter_by(
        user_id=user_id,
        provider="google",
        service_type="calendar",
    ).one()
    assert account.status == "connected"
    assert account.email == "callback@gmail.com"
    assert account.access_token_encrypted != sample_access
    assert account.refresh_token_encrypted != sample_refresh
    assert decrypt_token(account.access_token_encrypted) == sample_access
    assert decrypt_token(account.refresh_token_encrypted) == sample_refresh


def test_calendar_sync_upserts_events(client, db, integration_token, google_config, monkeypatch):
    from app.models.calendar import CalendarEvent
    from app.models.integration import UserIntegration
    from app.services.google_calendar_adapter import GoogleCalendarEvent
    from app.services.google_oauth import store_google_tokens, GoogleTokens
    from app.services import google_integration_sync

    token, user_id = integration_token
    account = UserIntegration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider="google",
        service_type="calendar",
        status="connected",
        connected_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    store_google_tokens(account, GoogleTokens("access", 3600, "calendar", refresh_token="refresh"))
    db.add(account)
    db.commit()

    fake_event = GoogleCalendarEvent(
        id="gcal-1",
        summary="Study D278",
        start="2026-06-24T19:00:00Z",
        end="2026-06-24T20:00:00Z",
        calendar_id="primary",
        raw_metadata={"id": "gcal-1"},
    )
    monkeypatch.setattr(
        google_integration_sync.google_calendar_adapter,
        "list_events",
        lambda **kwargs: [fake_event],
    )

    first = client.post("/api/v1/integrations/google/sync", headers=_auth(token), json={"service_type": "calendar"})
    second = client.post("/api/v1/integrations/google/sync", headers=_auth(token), json={"service_type": "calendar"})

    assert first.status_code == 200
    assert second.status_code == 200
    assert db.query(CalendarEvent).filter_by(user_id=user_id, external_event_id="gcal-1").count() == 1
    assert second.json()["summaries"][0]["records_updated"] == 1


def test_gmail_sync_upserts_messages(client, db, integration_token, google_config, monkeypatch):
    from app.models.email import EmailMessage
    from app.models.integration import UserIntegration
    from app.services.gmail_adapter import GmailMessage
    from app.services.google_oauth import store_google_tokens, GoogleTokens
    from app.services import google_integration_sync

    token, user_id = integration_token
    account = UserIntegration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider="google",
        service_type="gmail",
        status="connected",
        connected_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    store_google_tokens(account, GoogleTokens("access", 3600, "gmail", refresh_token="refresh"))
    db.add(account)
    db.commit()

    fake_message = GmailMessage(
        id="gmail-1",
        thread_id="thread-1",
        sender="sender@example.com",
        subject="Important update",
        snippet="Metadata only",
        received_at="Wed, 24 Jun 2026 19:00:00 +0000",
        importance="high",
        label_ids=["INBOX", "IMPORTANT"],
        is_unread=True,
        recipients=["integration@example.com"],
        has_attachments=True,
        raw_metadata={"id": "gmail-1"},
    )
    monkeypatch.setattr(
        google_integration_sync.gmail_adapter,
        "search_messages",
        lambda **kwargs: [fake_message],
    )

    response = client.post("/api/v1/integrations/google/sync", headers=_auth(token), json={"service_type": "gmail"})

    assert response.status_code == 200
    row = db.query(EmailMessage).filter_by(user_id=user_id, external_message_id="gmail-1").one()
    assert row.thread_id == "thread-1"
    assert row.labels == ["INBOX", "IMPORTANT"]
    assert row.has_attachments is True


def test_disconnect_flow_and_status_response(client, db, integration_token, google_config):
    from app.models.integration import UserIntegration

    token, user_id = integration_token
    db.add(UserIntegration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider="google",
        service_type="calendar",
        email="user@gmail.com",
        status="connected",
        connected_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    ))
    db.commit()

    status_before = client.get("/api/v1/integrations", headers=_auth(token))
    assert status_before.status_code == 200
    assert status_before.json()["services"][0]["status"] == "connected"

    response = client.post(
        "/api/v1/integrations/google/disconnect",
        headers=_auth(token),
        json={"service_type": "calendar"},
    )

    assert response.status_code == 200
    assert response.json()["disconnected"] == ["calendar"]


def test_integration_status_exposes_requires_reconnect(client, db, integration_token, google_config):
    from app.models.integration import UserIntegration

    token, user_id = integration_token
    db.add(UserIntegration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider="google",
        service_type="calendar",
        email="user@gmail.com",
        status="needs_attention",
        connected_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    ))
    db.commit()

    response = client.get("/api/v1/integrations", headers=_auth(token))

    assert response.status_code == 200
    calendar_service = next(item for item in response.json()["services"] if item["service_type"] == "calendar")
    assert calendar_service["status"] == "needs_attention"
    assert calendar_service["requires_reconnect"] is True


def test_refresh_token_failure_marks_needs_attention(db, integration_token, google_config, monkeypatch):
    from app.models.integration import UserIntegration
    from app.services.google_oauth import ensure_valid_access_token, store_google_tokens, GoogleTokens
    from app.services.integration_errors import IntegrationError, IntegrationErrorCode

    _token, user_id = integration_token
    account = UserIntegration(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider="google",
        service_type="calendar",
        status="connected",
        connected_at=datetime.now(timezone.utc),
        token_expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    store_google_tokens(account, GoogleTokens("access", 1, "calendar", refresh_token="refresh"))
    account.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.add(account)
    db.commit()

    monkeypatch.setattr(
        "app.services.google_oauth.refresh_access_token",
        lambda refresh: (_ for _ in ()).throw(IntegrationError(IntegrationErrorCode.REFRESH_FAILED, "Refresh failed")),
    )

    with pytest.raises(IntegrationError):
        ensure_valid_access_token(account, db)

    db.refresh(account)
    assert account.status == "needs_attention"
