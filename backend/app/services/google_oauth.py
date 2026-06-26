from __future__ import annotations

import logging
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.models.integration import UserIntegration
from app.services.integration_errors import IntegrationError, IntegrationErrorCode
from app.services.token_encryption import TokenEncryptionError, decrypt_token, encrypt_token

logger = logging.getLogger(__name__)

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com"
MIN_GOOGLE_CLIENT_SECRET_LENGTH = 16


def _is_placeholder(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return (
        not normalized
        or normalized in {"placeholder", "changeme", "change-me", "your-google-client-id", "your-google-client-secret"}
        or normalized.startswith("your-")
    )


class OAuthNotConfiguredError(IntegrationError):
    def __init__(self, missing: list[str]) -> None:
        super().__init__(
            IntegrationErrorCode.MISSING_CREDENTIALS,
            f"Google OAuth is not configured. Missing: {', '.join(missing)}.",
            status_code=503,
        )
        self.missing = missing


@dataclass
class GoogleTokens:
    access_token: str
    expires_in: int
    scope: str
    token_type: str = "Bearer"
    refresh_token: str | None = None
    stub: bool = False

    @property
    def expires_at(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(seconds=max(0, self.expires_in))


@dataclass
class GoogleAccountProfile:
    email: str | None
    display_name: str | None


def configured_google_scopes() -> list[str]:
    scopes = [scope.strip() for scope in settings.google_scopes.split() if scope.strip()]
    return scopes or [CALENDAR_SCOPE, GMAIL_SCOPE, USERINFO_EMAIL_SCOPE]


def scopes_for_service(service_type: str) -> list[str]:
    configured = set(configured_google_scopes())
    scopes: list[str] = []
    if service_type in {"calendar", "both"} and CALENDAR_SCOPE in configured:
        scopes.append(CALENDAR_SCOPE)
    if service_type in {"gmail", "both"} and GMAIL_SCOPE in configured:
        scopes.append(GMAIL_SCOPE)
    if USERINFO_EMAIL_SCOPE in configured:
        scopes.append(USERINFO_EMAIL_SCOPE)
    return scopes or configured_google_scopes()


def missing_oauth_vars() -> list[str]:
    missing: list[str] = []
    client_id = (settings.google_client_id or "").strip()
    client_secret = (settings.google_client_secret or "").strip()
    if _is_placeholder(client_id) or not client_id.endswith(GOOGLE_CLIENT_ID_SUFFIX):
        missing.append("GOOGLE_CLIENT_ID")
    if _is_placeholder(client_secret) or len(client_secret) < MIN_GOOGLE_CLIENT_SECRET_LENGTH:
        missing.append("GOOGLE_CLIENT_SECRET")
    if not settings.token_encryption_key:
        missing.append("TOKEN_ENCRYPTION_KEY")
    return missing


def is_oauth_configured() -> bool:
    return not missing_oauth_vars()


def _raise_if_not_configured() -> None:
    missing = missing_oauth_vars()
    if missing:
        raise OAuthNotConfiguredError(missing)


def _token_error(resp: httpx.Response) -> IntegrationError:
    try:
        payload = resp.json()
    except Exception:
        payload = {}
    error = payload.get("error")
    if error in {"invalid_grant", "unauthorized_client"}:
        code = IntegrationErrorCode.INVALID_GRANT
        message = "Google authorization expired or was rejected. Please reconnect."
    elif resp.status_code == 429:
        code = IntegrationErrorCode.API_RATE_LIMITED
        message = "Google rate limit reached. Please try again shortly."
    elif resp.status_code >= 500:
        code = IntegrationErrorCode.PROVIDER_UNAVAILABLE
        message = "Google is temporarily unavailable. Please try again shortly."
    else:
        code = IntegrationErrorCode.UNKNOWN_ERROR
        message = "Google OAuth failed. Please try again."
    return IntegrationError(code, message, status_code=502)


def exchange_authorization_code(code: str, redirect_uri: str) -> GoogleTokens:
    _raise_if_not_configured()
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
        raise IntegrationError(
            IntegrationErrorCode.PROVIDER_UNAVAILABLE,
            "Google OAuth timed out. Please try again.",
            raw_error=exc,
        ) from exc
    except httpx.RequestError as exc:
        raise IntegrationError(
            IntegrationErrorCode.PROVIDER_UNAVAILABLE,
            "Could not reach Google OAuth. Please try again.",
            raw_error=exc,
        ) from exc

    if resp.status_code != 200:
        raise _token_error(resp)

    payload = resp.json()
    return GoogleTokens(
        access_token=payload["access_token"],
        refresh_token=payload.get("refresh_token"),
        expires_in=int(payload.get("expires_in", 3600)),
        scope=payload.get("scope", ""),
        token_type=payload.get("token_type", "Bearer"),
        stub=False,
    )


def refresh_access_token(refresh_token: str) -> GoogleTokens:
    _raise_if_not_configured()
    try:
        resp = httpx.post(
            _GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=10.0,
        )
    except httpx.TimeoutException as exc:
        raise IntegrationError(
            IntegrationErrorCode.PROVIDER_UNAVAILABLE,
            "Google token refresh timed out. Please try again.",
            raw_error=exc,
        ) from exc
    except httpx.RequestError as exc:
        raise IntegrationError(
            IntegrationErrorCode.PROVIDER_UNAVAILABLE,
            "Could not refresh Google credentials. Please try again.",
            raw_error=exc,
        ) from exc

    if resp.status_code != 200:
        raise IntegrationError(
            IntegrationErrorCode.REFRESH_FAILED,
            "Google credentials need attention. Please reconnect.",
            raw_error=_token_error(resp),
        )

    payload = resp.json()
    return GoogleTokens(
        access_token=payload["access_token"],
        refresh_token=payload.get("refresh_token") or refresh_token,
        expires_in=int(payload.get("expires_in", 3600)),
        scope=payload.get("scope", ""),
        token_type=payload.get("token_type", "Bearer"),
        stub=False,
    )


def fetch_google_account_profile(access_token: str) -> GoogleAccountProfile:
    try:
        resp = httpx.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
    except httpx.RequestError:
        return GoogleAccountProfile(email=None, display_name=None)
    if resp.status_code != 200:
        return GoogleAccountProfile(email=None, display_name=None)
    payload = resp.json()
    return GoogleAccountProfile(
        email=payload.get("email"),
        display_name=payload.get("name"),
    )


def store_google_tokens(account: UserIntegration, tokens: GoogleTokens) -> None:
    try:
        account.access_token_encrypted = encrypt_token(tokens.access_token)
        if tokens.refresh_token:
            account.refresh_token_encrypted = encrypt_token(tokens.refresh_token)
        account.token_expires_at = tokens.expires_at
        if tokens.scope:
            account.scopes = json.dumps(tokens.scope.split())
    except TokenEncryptionError as exc:
        raise IntegrationError(
            IntegrationErrorCode.UNKNOWN_ERROR,
            "Token storage failed. Check server configuration.",
            status_code=500,
            raw_error=exc,
        ) from exc


def ensure_valid_access_token(account: UserIntegration, db) -> str:
    if not account.access_token_encrypted:
        account.status = "needs_attention"
        db.commit()
        raise IntegrationError(
            IntegrationErrorCode.TOKEN_EXPIRED,
            "Google credentials need attention. Please reconnect.",
            service_type=account.service_type,
        )

    now = datetime.now(timezone.utc)
    expires_at = account.token_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at <= now + timedelta(minutes=2):
        if not account.refresh_token_encrypted:
            account.status = "needs_attention"
            db.commit()
            raise IntegrationError(
                IntegrationErrorCode.TOKEN_EXPIRED,
                "Google credentials expired. Please reconnect.",
                service_type=account.service_type,
            )
        try:
            refresh_token = decrypt_token(account.refresh_token_encrypted)
            refreshed = refresh_access_token(refresh_token)
            store_google_tokens(account, refreshed)
            account.status = "connected"
            account.updated_at = now
            db.commit()
        except Exception as exc:
            account.status = "needs_attention"
            account.updated_at = now
            db.commit()
            raise IntegrationError(
                IntegrationErrorCode.REFRESH_FAILED,
                "Google credentials need attention. Please reconnect.",
                service_type=account.service_type,
                raw_error=exc if isinstance(exc, Exception) else None,
            ) from exc

    try:
        return decrypt_token(account.access_token_encrypted)
    except TokenEncryptionError as exc:
        account.status = "needs_attention"
        account.updated_at = now
        db.commit()
        raise IntegrationError(
            IntegrationErrorCode.REFRESH_FAILED,
            "Google credentials need attention. Please reconnect.",
            service_type=account.service_type,
            raw_error=exc,
        ) from exc
