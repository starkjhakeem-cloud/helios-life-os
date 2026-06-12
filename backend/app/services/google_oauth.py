"""
Google OAuth 2.0 token exchange service.

V2.16 status: _STUB_EXCHANGE = True.
All required credential validation is active; actual HTTP calls to Google are
bypassed until the stub flag is flipped.

To activate real token exchange:
1. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY in .env
2. Set _STUB_EXCHANGE = False below
3. Wire token encryption + DB storage in the calling router (V2.17)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings

logger = logging.getLogger(__name__)

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Controls whether the real HTTP call to Google is made.
# True  → credentials are validated, but a clearly-labelled placeholder is returned.
# False → a real POST to _GOOGLE_TOKEN_URL is performed (requires httpx installed).
_STUB_EXCHANGE: bool = True

_GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


class OAuthNotConfiguredError(Exception):
    """
    Raised when one or more required Google OAuth env vars are absent.
    Callers should surface this as HTTP 503 with detail=str(exc).
    """


@dataclass
class GoogleTokens:
    access_token: str
    expires_in: int            # seconds until the access token expires
    scope: str
    token_type: str = "Bearer"
    refresh_token: str | None = None
    stub: bool = False         # True means placeholder data — never store these


def missing_oauth_vars() -> list[str]:
    """Return the names of required OAuth env vars that are absent."""
    missing: list[str] = []
    if not settings.google_client_id:
        missing.append("GOOGLE_CLIENT_ID")
    if not settings.google_client_secret:
        missing.append("GOOGLE_CLIENT_SECRET")
    if not settings.token_encryption_key:
        missing.append("TOKEN_ENCRYPTION_KEY")
    return missing


def is_oauth_configured() -> bool:
    """True when all required OAuth env vars are present."""
    return not missing_oauth_vars()


def exchange_authorization_code(code: str, redirect_uri: str) -> GoogleTokens:
    """
    Exchange a Google authorization code for access and refresh tokens.

    Raises OAuthNotConfiguredError if GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    or TOKEN_ENCRYPTION_KEY are missing — aborting before any network call.

    When _STUB_EXCHANGE is True (V2.16 default):
    - All credentials are validated.
    - No HTTP call is made.
    - Returns a GoogleTokens with stub=True and placeholder token strings.

    When _STUB_EXCHANGE is False:
    - Issues a real POST to https://oauth2.googleapis.com/token via httpx.
    - Returns a GoogleTokens with stub=False and live token values.
    - Caller is responsible for encrypting and persisting the tokens.

    Token storage is NOT performed here — the calling router owns that step.
    """
    absent = missing_oauth_vars()
    if absent:
        raise OAuthNotConfiguredError(
            f"Google OAuth is not configured. "
            f"Missing env var(s): {', '.join(absent)}. "
            "Add them to backend/.env — see backend/.env.example for instructions."
        )

    if _STUB_EXCHANGE:
        logger.warning(
            "google_oauth: exchange_authorization_code called in STUB mode. "
            "Credentials are configured but _STUB_EXCHANGE=True — no Google API call was made. "
            "Set _STUB_EXCHANGE=False in app/services/google_oauth.py to activate real exchange."
        )
        return GoogleTokens(
            access_token="stub_access_token__not_real__do_not_store",
            refresh_token="stub_refresh_token__not_real__do_not_store",
            expires_in=3600,
            scope=" ".join(_GOOGLE_SCOPES),
            stub=True,
        )

    # ── Real exchange — reached only when _STUB_EXCHANGE = False ─────────────
    import httpx  # deferred import; only needed in the non-stub path

    try:
        resp = httpx.post(
            _GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10.0,
        )
    except httpx.TimeoutException as exc:
        raise RuntimeError("Google token endpoint timed out after 10 s.") from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"Network error contacting Google token endpoint: {exc}") from exc

    if resp.status_code != 200:
        raise RuntimeError(
            f"Google token exchange returned HTTP {resp.status_code}: {resp.text}"
        )

    payload = resp.json()
    return GoogleTokens(
        access_token=payload["access_token"],
        refresh_token=payload.get("refresh_token"),
        expires_in=payload.get("expires_in", 3600),
        scope=payload.get("scope", ""),
        stub=False,
    )
