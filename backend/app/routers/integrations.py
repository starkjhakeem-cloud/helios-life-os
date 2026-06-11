import json
import secrets
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.integration import UserIntegration
from app.models.sync_job import SyncJob
from app.models.user import User
from app.schemas.integration import (
    CallbackResponse,
    ConnectUrlResponse,
    IntegrationListResponse,
    IntegrationOut,
    MockConnectRequest,
    SyncJobOut,
    SyncStatusResponse,
)
from app.services.sync_simulator import run_mock_sync

router = APIRouter()

# All providers surfaced to the operator, in display order.
_KNOWN_PROVIDERS = [
    "google_calendar",
    "gmail",
    "outlook_calendar",
    "outlook_mail",
]

# Default OAuth scopes per provider.
# Pre-populated on mock-connect so the architecture is ready for real OAuth
# without a schema migration — just swap mock tokens for real ones.
_DEFAULT_SCOPES: dict[str, list[str]] = {
    "google_calendar": [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
    ],
    "gmail": [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
    ],
    "outlook_calendar": ["Calendars.ReadWrite"],
    "outlook_mail": ["Mail.ReadWrite", "Mail.Send"],
}


def _decode_scopes(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


def _to_out(row: UserIntegration) -> IntegrationOut:
    return IntegrationOut(
        id=row.id,
        provider=row.provider,
        status=row.status,
        connected_at=row.connected_at.isoformat() if row.connected_at else None,
        last_sync_at=row.last_sync_at.isoformat() if row.last_sync_at else None,
        token_expires_at=row.token_expires_at.isoformat() if row.token_expires_at else None,
        scopes=_decode_scopes(row.scopes),
    )


def _stub(provider: str) -> IntegrationOut:
    """Synthesise a disconnected entry for a provider with no DB row."""
    return IntegrationOut(
        id=None,
        provider=provider,
        status="disconnected",
        connected_at=None,
        last_sync_at=None,
        token_expires_at=None,
        scopes=[],
    )


@router.get("", response_model=IntegrationListResponse)
def list_integrations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntegrationListResponse:
    rows = db.execute(
        select(UserIntegration).where(UserIntegration.user_id == current_user.id)
    ).scalars().all()
    by_provider = {r.provider: r for r in rows}
    integrations = [
        _to_out(by_provider[p]) if p in by_provider else _stub(p)
        for p in _KNOWN_PROVIDERS
    ]
    return IntegrationListResponse(integrations=integrations)


@router.post("/mock-connect", response_model=IntegrationOut, status_code=201)
def mock_connect(
    payload: MockConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntegrationOut:
    """
    Simulate connecting an integration. Creates or re-activates the DB row with
    pre-populated OAuth scopes so real token storage needs only a column add,
    not a schema redesign.
    No real OAuth flow or external API call is made.
    """
    now = datetime.now(timezone.utc)
    existing = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.provider == payload.provider,
        )
    ).scalar_one_or_none()

    if existing:
        existing.status = "connected"
        existing.connected_at = now
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        return _to_out(existing)

    row = UserIntegration(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        provider=payload.provider,
        status="connected",
        connected_at=now,
        last_sync_at=None,
        scopes=json.dumps(_DEFAULT_SCOPES.get(payload.provider, [])),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


def _job_to_out(job: SyncJob) -> SyncJobOut:
    return SyncJobOut(
        id=job.id,
        integration_id=job.integration_id,
        provider=job.provider,
        status=job.status,
        started_at=job.started_at.isoformat(),
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        records_processed=job.records_processed,
        records_created=job.records_created,
        records_updated=job.records_updated,
        errors=json.loads(job.errors) if job.errors else [],
    )


@router.get("/sync/status", response_model=SyncStatusResponse)
def get_sync_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncStatusResponse:
    """Return the most recent sync job for each of the user's connected integrations."""
    connected = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.status == "connected",
        )
    ).scalars().all()

    jobs: list[SyncJobOut] = []
    for integration in connected:
        job = db.execute(
            select(SyncJob)
            .where(
                SyncJob.integration_id == integration.id,
                SyncJob.user_id == current_user.id,
            )
            .order_by(SyncJob.started_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if job:
            jobs.append(_job_to_out(job))

    return SyncStatusResponse(jobs=jobs)


_GOOGLE_SCOPES = " ".join([
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
])

_GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"


@router.get("/google/connect-url", response_model=ConnectUrlResponse)
def google_connect_url(
    current_user: User = Depends(get_current_user),
) -> ConnectUrlResponse:
    """
    Generate (or return a placeholder) Google OAuth 2.0 authorization URL.

    When GOOGLE_CLIENT_ID is configured, produces a real URL that — once a
    callback handler and token exchange are implemented — will complete the
    OAuth flow.

    When GOOGLE_CLIENT_ID is not configured, returns a clearly-labelled
    placeholder URL so the frontend skeleton can display/log the URL shape
    without requiring real credentials.

    IMPORTANT — V2.15 skeleton:
    - The `state` token is generated but NOT persisted.
    - No browser redirect happens from this endpoint.
    - No token exchange is implemented yet.
    - The callback endpoint (GET /google/callback) also does not exchange tokens.
    """
    state = secrets.token_urlsafe(32)

    if not settings.google_client_id:
        placeholder_params = {
            "client_id": "YOUR_GOOGLE_CLIENT_ID",
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": _GOOGLE_SCOPES,
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        return ConnectUrlResponse(
            url=f"{_GOOGLE_AUTH_BASE}?{urlencode(placeholder_params)}",
            state=state,
            configured=False,
            note=(
                "GOOGLE_CLIENT_ID is not set. "
                "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY "
                "in .env to generate a real authorization URL."
            ),
        )

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": _GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return ConnectUrlResponse(
        url=f"{_GOOGLE_AUTH_BASE}?{urlencode(params)}",
        state=state,
        configured=True,
        note=(
            "Real authorization URL generated. "
            "State token not yet persisted — store and verify state before "
            "redirecting in production. Token exchange not yet implemented (V2.15 skeleton)."
        ),
    )


@router.get("/google/callback", response_model=CallbackResponse)
def google_oauth_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
) -> CallbackResponse:
    """
    Google OAuth 2.0 callback skeleton — accepts the redirect from Google
    (or from the mobile app after it intercepts the deep link).

    V2.15 skeleton:
    - Does NOT verify the state parameter (would require persisted state lookup).
    - Does NOT exchange the authorization code for tokens.
    - Does NOT call any Google API.
    - Returns a structured JSON response describing what was received.

    Production implementation (V2.16+) will:
    1. Verify state matches the value stored for this user (CSRF protection).
    2. POST to https://oauth2.googleapis.com/token to exchange `code` for
       access_token and refresh_token.
    3. Encrypt tokens via app.services.token_encryption and persist to
       user_integrations.
    4. Redirect the mobile app via the helios:// deep link.
    """
    if error:
        return CallbackResponse(
            success=False,
            provider="google",
            code_received=False,
            note=f"Google returned an error: {error}. {error_description or ''}".strip(". ") + ".",
        )

    if not code:
        return CallbackResponse(
            success=False,
            provider="google",
            code_received=False,
            note="No authorization code received. The request may have been cancelled.",
        )

    # Real implementation: verify state, exchange code, encrypt tokens.
    return CallbackResponse(
        success=False,
        provider="google",
        code_received=True,
        note=(
            "Authorization code received. "
            "Token exchange not yet implemented — this is the V2.15 skeleton. "
            "Implement state verification and token exchange in V2.16."
        ),
    )


@router.post("/{integration_id}/sync", response_model=SyncJobOut, status_code=201)
def trigger_sync(
    integration_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncJobOut:
    """
    Run a mock sync for the given connected integration.
    Upserts simulated records into calendar_events or email_messages, then
    updates integration.last_sync_at. Real sync workers will replace the
    simulation while keeping the same SyncJob row lifecycle.
    """
    integration = db.execute(
        select(UserIntegration).where(
            UserIntegration.id == integration_id,
            UserIntegration.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found.")
    if integration.status != "connected":
        raise HTTPException(
            status_code=422,
            detail="Integration is not connected. Connect it before syncing.",
        )

    now = datetime.now(timezone.utc)
    job = SyncJob(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        integration_id=integration_id,
        provider=integration.provider,
        status="running",
        started_at=now,
        completed_at=None,
        records_processed=0,
        records_created=0,
        records_updated=0,
        errors=None,
    )
    db.add(job)
    db.commit()

    try:
        created, updated, errors = run_mock_sync(integration.provider, current_user.id, db)

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        job.records_created = created
        job.records_updated = updated
        job.records_processed = created + updated
        job.errors = json.dumps(errors) if errors else None

        integration.last_sync_at = datetime.now(timezone.utc)
        integration.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(job)
        return _job_to_out(job)

    except Exception as exc:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        job.errors = json.dumps([str(exc)])
        db.commit()
        db.refresh(job)
        return _job_to_out(job)


@router.delete("/{integration_id}", status_code=204)
def disconnect(
    integration_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.execute(
        select(UserIntegration).where(
            UserIntegration.id == integration_id,
            UserIntegration.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Integration not found.")
    db.delete(row)
    db.commit()
