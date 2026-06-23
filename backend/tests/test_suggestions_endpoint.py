"""
Tests for GET /api/v1/autonomy/suggestions.

Covers:
- 200 response with correct schema (source, degraded, message fields)
- suggestions list is never empty (at least one rule-based item)
- context_service._section_user_profile uses prefs.preferred_name, not profile.preferred_name
- endpoint returns graceful degradation response when context service fails
"""
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def suggest_token(db):
    """
    Create a user directly (no HTTP, no rate limits) and return an access token.
    Function-scoped so it runs after clean_database clears the DB.
    """
    from app.core.jwt import create_access_token
    from app.core.security import hash_password
    from app.models.user import User
    from app.models.user_preferences import UserPreferences

    now = datetime.now(timezone.utc)
    user_id = str(uuid.uuid4())
    user = User(
        id=user_id,
        name="Suggest Test User",
        email="suggest_direct@example.com",
        hashed_password=hash_password("TestPass123!"),
        created_at=now,
    )
    db.add(user)

    prefs = UserPreferences(
        user_id=user_id,
        theme_preference="system",
        notifications_enabled=True,
        reminder_notifications=True,
        ai_notifications=False,
        default_planning_horizon=7,
        location="New York",
        assistant_tone="balanced",
        daily_brief_time="08:00",
        time_format="12h",
        updated_at=now,
    )
    db.add(prefs)
    db.commit()

    return create_access_token(user_id)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── Schema tests ──────────────────────────────────────────────────────────────

def test_suggestions_returns_200_with_schema(client, suggest_token):
    resp = client.get("/api/v1/autonomy/suggestions", headers=_auth(suggest_token))
    assert resp.status_code == 200
    data = resp.json()
    assert "suggestions" in data
    assert "total" in data
    assert "generated_at" in data
    assert "source" in data
    assert "degraded" in data
    assert data["source"] in ("ai", "local", "hybrid")
    assert isinstance(data["degraded"], bool)


def test_suggestions_never_empty(client, suggest_token):
    resp = client.get("/api/v1/autonomy/suggestions", headers=_auth(suggest_token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["suggestions"]) >= 1
    assert data["total"] == len(data["suggestions"])


def test_suggestions_item_schema(client, suggest_token):
    resp = client.get("/api/v1/autonomy/suggestions", headers=_auth(suggest_token))
    assert resp.status_code == 200
    item = resp.json()["suggestions"][0]
    for field in ("id", "title", "description", "source_agent", "suggested_action_type",
                  "risk_level", "reason", "payload_preview", "created_at"):
        assert field in item, f"Missing field: {field}"


def test_suggestions_limit_param(client, suggest_token):
    resp = client.get("/api/v1/autonomy/suggestions?limit=2", headers=_auth(suggest_token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["suggestions"]) <= 2


def test_suggestions_not_degraded_on_normal_request(client, suggest_token):
    """Normal requests should NOT be degraded (context service and mock provider work fine)."""
    resp = client.get("/api/v1/autonomy/suggestions", headers=_auth(suggest_token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["degraded"] is False
    assert data["message"] is None


def test_suggestions_still_200_when_context_fails(client, suggest_token):
    """Even if build_context raises, endpoint returns 200 with fallback suggestions."""
    with patch(
        "app.routers.autonomy.build_context",
        side_effect=RuntimeError("simulated context failure"),
    ):
        resp = client.get("/api/v1/autonomy/suggestions", headers=_auth(suggest_token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["suggestions"]) >= 1
    assert data["degraded"] is True
    assert data["message"] is not None


def test_suggestions_still_200_when_ai_provider_fails(client, suggest_token):
    """Even if the AI provider raises, endpoint returns 200 with fallback suggestions."""
    mock_provider = MagicMock()
    mock_provider.generate_suggestions.side_effect = RuntimeError("simulated AI failure")

    with patch("app.routers.autonomy.get_ai_provider", return_value=mock_provider):
        resp = client.get("/api/v1/autonomy/suggestions", headers=_auth(suggest_token))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["suggestions"]) >= 1
    assert data["degraded"] is True


# ── Unit test: context_service bug fix ───────────────────────────────────────

def test_section_user_profile_uses_prefs_preferred_name_not_profile():
    """
    Regression test: profile.preferred_name was previously referenced, but UserProfile
    has no such attribute. This test confirms the fix: prefs.preferred_name is used instead.
    """
    from app.ai.context_service import _section_user_profile
    from sqlalchemy.orm import Session

    prefs = MagicMock()
    prefs.preferred_name = "Alex"
    prefs.primary_location = None
    prefs.location = None
    prefs.work_focus = None
    prefs.daily_brief_time = None
    prefs.assistant_tone = "balanced"
    prefs.important_life_areas = None

    profile = MagicMock()
    # Intentionally remove preferred_name from profile — it doesn't exist on UserProfile.
    # The old bug read profile.preferred_name; accessing it here would raise AttributeError.
    del profile.preferred_name

    db = MagicMock(spec=Session)
    db.execute.return_value.scalar_one_or_none.side_effect = [prefs, profile]

    text, label = _section_user_profile("Fallback Name", "user-123", db)
    assert text is not None
    assert "Alex" in text
    assert label == "user_profile"
