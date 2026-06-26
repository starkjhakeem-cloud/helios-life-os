import json
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.integration import UserIntegration
from app.models.integration_oauth_state import IntegrationOAuthState
from app.models.sync_job import SyncJob
from app.models.user import User
from app.schemas.integration import (
    ConnectedServiceOut,
    ConnectUrlResponse,
    ExchangeCodeRequest,
    ExchangeCodeResponse,
    GoogleDisconnectRequest,
    GoogleDisconnectResponse,
    GoogleSyncRequest,
    GoogleSyncResponse,
    IntegrationListResponse,
    IntegrationOut,
    MockConnectRequest,
    SyncJobOut,
    SyncStatusResponse,
)
from app.services.google_integration_sync import sync_google, sync_google_service
from app.services.google_oauth import (
    exchange_authorization_code,
    fetch_google_account_profile,
    is_oauth_configured,
    scopes_for_service,
    store_google_tokens,
)
from app.services.integration_errors import IntegrationError, IntegrationErrorCode
from app.services.sync_simulator import run_mock_sync

logger = logging.getLogger(__name__)
router = APIRouter()

_KNOWN_PROVIDERS = [
    "google_calendar",
    "gmail",
    "outlook_calendar",
    "outlook_mail",
]

_GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"


def _decode_scopes(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
        return decoded if isinstance(decoded, list) else str(raw).split()
    except (json.JSONDecodeError, TypeError):
        return str(raw).split()


def _service_to_legacy_provider(service_type: str) -> str:
    return "google_calendar" if service_type == "calendar" else "gmail"


def _google_services(service_type: str) -> list[str]:
    return ["calendar", "gmail"] if service_type == "both" else [service_type]


def _requires_reconnect(row: UserIntegration | None) -> bool:
    if row is None:
        return False
    return row.status == "needs_attention"


def _to_out(row: UserIntegration, provider_key: str | None = None) -> IntegrationOut:
    return IntegrationOut(
        id=row.id,
        # Use provider_key when the DB row uses the new-style provider="google"
        # schema so that the mobile app can look up the correct PROVIDER_META entry.
        provider=provider_key or row.provider,
        service_type=row.service_type,
        email=row.email,
        display_name=row.display_name,
        status=row.status,
        connected_at=row.connected_at.isoformat() if row.connected_at else None,
        last_sync_at=row.last_sync_at.isoformat() if row.last_sync_at else None,
        token_expires_at=row.token_expires_at.isoformat() if row.token_expires_at else None,
        scopes=_decode_scopes(row.scopes),
        requires_reconnect=_requires_reconnect(row),
    )


def _stub(provider: str) -> IntegrationOut:
    return IntegrationOut(
        id=None,
        provider=provider,
        service_type=None,
        email=None,
        display_name=None,
        status="disconnected",
        connected_at=None,
        last_sync_at=None,
        token_expires_at=None,
        scopes=[],
        requires_reconnect=False,
    )


def _service_out(rows: list[UserIntegration], service_type: str) -> ConnectedServiceOut:
    row = next(
        (
            item for item in rows
            if item.provider == "google" and item.service_type == service_type
        ),
        None,
    )
    if row is None:
        legacy_provider = _service_to_legacy_provider(service_type)
        row = next((item for item in rows if item.provider == legacy_provider), None)
    if row is None:
        return ConnectedServiceOut(
            service_type=service_type,
            status="not_connected",
            email=None,
            display_name=None,
            last_sync_at=None,
            automatic_sync=False,
            token_expires_at=None,
            scopes=[],
            requires_reconnect=False,
        )
    return ConnectedServiceOut(
        service_type=service_type,
        status=row.status,
        requires_reconnect=_requires_reconnect(row),
        email=row.email,
        display_name=row.display_name,
        last_sync_at=row.last_sync_at.isoformat() if row.last_sync_at else None,
        automatic_sync=row.status == "connected",
        token_expires_at=row.token_expires_at.isoformat() if row.token_expires_at else None,
        scopes=_decode_scopes(row.scopes),
    )


def _job_to_out(job: SyncJob) -> SyncJobOut:
    return SyncJobOut(
        id=job.id,
        integration_id=job.integration_id,
        provider=job.provider,
        service_type=job.service_type,
        status=job.status,
        started_at=job.started_at.isoformat(),
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        records_processed=job.records_processed,
        records_created=job.records_created,
        records_updated=job.records_updated,
        records_skipped=job.records_skipped,
        error_message=job.error_message,
        errors=json.loads(job.errors) if job.errors else [],
    )


def _integration_error_response(exc: IntegrationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.public_detail())


def _google_oauth_redirect_url(
    *,
    success: bool,
    service_type: str | None = None,
    services: list[str] | None = None,
    code: str | None = None,
    message: str | None = None,
) -> str:
    params = {
        "success": "true" if success else "false",
        "provider": "google",
    }
    if service_type:
        params["service_type"] = service_type
    if services:
        params["services"] = ",".join(services)
    if code:
        params["code"] = code
    if message:
        params["message"] = message
    return f"{settings.google_oauth_app_redirect_uri}?{urlencode(params)}"


def _google_oauth_redirect(
    *,
    success: bool,
    service_type: str | None = None,
    services: list[str] | None = None,
    code: str | None = None,
    message: str | None = None,
) -> RedirectResponse:
    return RedirectResponse(
        _google_oauth_redirect_url(
            success=success,
            service_type=service_type,
            services=services,
            code=code,
            message=message,
        ),
        status_code=302,
    )


def _get_state_or_400(state: str | None, db: Session) -> IntegrationOAuthState:
    if not state:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "integration_unavailable",
                "code": "oauth_denied",
                "message": "OAuth state is missing. Please start the connection again.",
                "provider": "google",
                "service_type": None,
            },
        )
    row = db.execute(
        select(IntegrationOAuthState).where(IntegrationOAuthState.state == state)
    ).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    expires_at = row.expires_at if row else None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not row or row.consumed_at is not None or not expires_at or expires_at <= now:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "integration_unavailable",
                "code": "oauth_denied",
                "message": "OAuth session expired. Please start the connection again.",
                "provider": "google",
                "service_type": None,
            },
        )
    return row


def _upsert_google_accounts(
    *,
    user_id: str,
    service_type: str,
    tokens,
    fallback_email: str | None,
    fallback_name: str | None,
    db: Session,
) -> list[str]:
    profile = fetch_google_account_profile(tokens.access_token)
    email = profile.email or fallback_email
    display_name = profile.display_name or fallback_name
    now = datetime.now(timezone.utc)
    connected: list[str] = []
    for service in _google_services(service_type):
        account = db.execute(
            select(UserIntegration).where(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == "google",
                UserIntegration.service_type == service,
            )
        ).scalar_one_or_none()
        if not account:
            account = UserIntegration(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider="google",
                service_type=service,
                created_at=now,
                updated_at=now,
            )
            db.add(account)
        account.email = email
        account.display_name = display_name
        account.status = "connected"
        account.connected_at = account.connected_at or now
        account.updated_at = now
        store_google_tokens(account, tokens)
        connected.append(service)
    return connected


def _preserve_connected_after_initial_sync(
    *,
    user_id: str,
    services: list[str],
    db: Session,
) -> None:
    now = datetime.now(timezone.utc)
    restored = False
    for service in services:
        account = db.execute(
            select(UserIntegration).where(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == "google",
                UserIntegration.service_type == service,
            )
        ).scalar_one_or_none()
        if account and account.status == "error":
            account.status = "connected"
            account.updated_at = now
            restored = True
    if restored:
        db.commit()


@router.get("", response_model=IntegrationListResponse)
def list_integrations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntegrationListResponse:
    rows = db.execute(
        select(UserIntegration).where(UserIntegration.user_id == current_user.id)
    ).scalars().all()

    # Build a lookup keyed by the frontend provider strings expected by PROVIDER_META.
    # The DB may hold rows in two schemas:
    #   Legacy: provider="google_calendar" | "gmail", service_type=None
    #   New OAuth: provider="google", service_type="calendar" | "gmail" | "both"
    by_provider: dict[str, UserIntegration] = {}
    for r in rows:
        if r.service_type is None:
            by_provider[r.provider] = r
        elif r.provider == "google":
            if r.service_type in ("calendar", "both"):
                by_provider["google_calendar"] = r
            if r.service_type in ("gmail", "both"):
                by_provider["gmail"] = r

    integrations = [
        _to_out(by_provider[p], provider_key=p) if p in by_provider else _stub(p)
        for p in _KNOWN_PROVIDERS
    ]
    return IntegrationListResponse(
        integrations=integrations,
        services=[
            _service_out(rows, "calendar"),
            _service_out(rows, "gmail"),
        ],
    )


@router.post("/mock-connect", response_model=IntegrationOut, status_code=201)
def mock_connect(
    payload: MockConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntegrationOut:
    now = datetime.now(timezone.utc)
    existing = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == current_user.id,
            UserIntegration.provider == payload.provider,
            UserIntegration.service_type.is_(None),
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
        service_type=None,
        status="connected",
        connected_at=now,
        last_sync_at=None,
        scopes=json.dumps(scopes_for_service("both")),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/sync/status", response_model=SyncStatusResponse)
def get_sync_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncStatusResponse:
    connected_ids = db.execute(
        select(UserIntegration.id).where(UserIntegration.user_id == current_user.id)
    ).scalars().all()
    jobs = db.execute(
        select(SyncJob)
        .where(SyncJob.user_id == current_user.id, SyncJob.integration_id.in_(connected_ids))
        .order_by(SyncJob.started_at.desc())
        .limit(20)
    ).scalars().all() if connected_ids else []
    return SyncStatusResponse(jobs=[_job_to_out(job) for job in jobs])


@router.get("/google/auth-url", response_model=ConnectUrlResponse)
@router.get("/google/connect-url", response_model=ConnectUrlResponse)
@router.get("/google/reconnect-url", response_model=ConnectUrlResponse)
def google_auth_url(
    service_type: str = Query(default="both", pattern="^(calendar|gmail|both)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConnectUrlResponse:
    scopes = scopes_for_service(service_type)
    state = secrets.token_urlsafe(32)
    configured = is_oauth_configured()

    params = {
        "client_id": settings.google_client_id if configured else "YOUR_GOOGLE_CLIENT_ID",
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    if configured:
        db.add(IntegrationOAuthState(
            state=state,
            user_id=current_user.id,
            provider="google",
            service_type=service_type,
            scopes=json.dumps(scopes),
            redirect_uri=settings.google_redirect_uri,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            created_at=datetime.now(timezone.utc),
        ))
        db.commit()

    return ConnectUrlResponse(
        url=f"{_GOOGLE_AUTH_BASE}?{urlencode(params)}",
        state=state,
        configured=configured,
        service_type=service_type,
        scopes=scopes,
        note=(
            "Real authorization URL generated."
            if configured
            else "Google OAuth is not configured. Add valid GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and TOKEN_ENCRYPTION_KEY."
        ),
    )


@router.get("/google/callback")
def google_oauth_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if error:
        logger.warning("google_callback_denied error=%s", error)
        return _google_oauth_redirect(
            success=False,
            code="oauth_denied",
            message="Google authorization was not completed.",
        )
    if not code:
        logger.warning("google_callback_missing_code")
        return _google_oauth_redirect(
            success=False,
            code="missing_code",
            message="No authorization code received.",
        )

    try:
        state_row = _get_state_or_400(state, db)
    except HTTPException:
        logger.warning("google_callback_invalid_state")
        return _google_oauth_redirect(
            success=False,
            code="invalid_state",
            message="Google authorization expired. Please try again.",
        )

    user = db.execute(select(User).where(User.id == state_row.user_id)).scalar_one()
    service_type = state_row.service_type
    logger.info("google_callback_received user_id=%s service_type=%s", user.id, service_type)

    try:
        tokens = exchange_authorization_code(code=code, redirect_uri=state_row.redirect_uri)
        logger.info(
            "google_callback_token_exchange_success user_id=%s service_type=%s has_refresh_token=%s",
            user.id,
            service_type,
            bool(tokens.refresh_token),
        )
        connected = _upsert_google_accounts(
            user_id=user.id,
            service_type=service_type,
            tokens=tokens,
            fallback_email=user.email,
            fallback_name=user.name,
            db=db,
        )
        state_row.consumed_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(
            "google_callback_tokens_stored user_id=%s services=%s",
            user.id,
            ",".join(connected),
        )

        try:
            sync_summaries = sync_google(user.id, service_type, db)
            logger.info(
                "google_callback_initial_sync_complete user_id=%s services=%s statuses=%s",
                user.id,
                ",".join(summary.service_type for summary in sync_summaries),
                ",".join(summary.status for summary in sync_summaries),
            )
        except Exception as sync_exc:
            logger.warning(
                "google_callback_initial_sync_failed user_id=%s service_type=%s error_type=%s",
                user.id,
                service_type,
                type(sync_exc).__name__,
            )
        _preserve_connected_after_initial_sync(user_id=user.id, services=connected, db=db)

        return _google_oauth_redirect(
            success=True,
            service_type=service_type,
            services=connected,
            message=f"Connected Google {', '.join(connected)}.",
        )
    except IntegrationError as exc:
        db.rollback()
        logger.warning(
            "google_callback_integration_error user_id=%s service_type=%s code=%s",
            user.id,
            service_type,
            exc.code.value,
        )
        return _google_oauth_redirect(
            success=False,
            service_type=service_type,
            code=exc.code.value,
            message=exc.message,
        )
    except Exception as exc:
        db.rollback()
        logger.error("google_callback: failed for user %s (%s)", user.id, type(exc).__name__)
        return _google_oauth_redirect(
            success=False,
            service_type=service_type,
            code=IntegrationErrorCode.UNKNOWN_ERROR.value,
            message="Google connection failed. Please try again.",
        )


@router.post("/google/exchange", response_model=ExchangeCodeResponse)
def google_exchange_code(
    payload: ExchangeCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExchangeCodeResponse:
    try:
        tokens = exchange_authorization_code(
            code=payload.code,
            redirect_uri=settings.google_redirect_uri,
        )
        connected = _upsert_google_accounts(
            user_id=current_user.id,
            service_type=payload.service_type,
            tokens=tokens,
            fallback_email=current_user.email,
            fallback_name=current_user.name,
            db=db,
        )
        db.commit()
    except IntegrationError as exc:
        raise _integration_error_response(exc)
    except Exception as exc:
        db.rollback()
        logger.error("google_exchange: token storage failed for user %s (%s)", current_user.id, type(exc).__name__)
        raise _integration_error_response(IntegrationError(
            IntegrationErrorCode.UNKNOWN_ERROR,
            "Google connection failed. Please try again.",
            status_code=500,
            raw_error=exc,
        ))

    return ExchangeCodeResponse(
        success=True,
        provider="google",
        stub=False,
        tokens_stored=True,
        services=connected,
        note=f"Connected Google {', '.join(connected)}.",
    )


@router.post("/google/sync", response_model=GoogleSyncResponse)
def google_sync(
    payload: GoogleSyncRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoogleSyncResponse:
    service_type = payload.service_type if payload else "both"
    try:
        summaries = sync_google(current_user.id, service_type, db)
    except IntegrationError as exc:
        raise _integration_error_response(exc)
    return GoogleSyncResponse(summaries=[summary.to_dict() for summary in summaries])


@router.post("/google/disconnect", response_model=GoogleDisconnectResponse)
def google_disconnect(
    payload: GoogleDisconnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GoogleDisconnectResponse:
    disconnected: list[str] = []
    now = datetime.now(timezone.utc)
    for service in _google_services(payload.service_type):
        row = db.execute(
            select(UserIntegration).where(
                UserIntegration.user_id == current_user.id,
                UserIntegration.provider == "google",
                UserIntegration.service_type == service,
            )
        ).scalar_one_or_none()
        if not row:
            continue
        row.status = "disconnected"
        row.access_token_encrypted = None
        row.refresh_token_encrypted = None
        row.token_expires_at = None
        row.updated_at = now
        disconnected.append(service)
    db.commit()
    return GoogleDisconnectResponse(disconnected=disconnected)


@router.post("/{integration_id}/sync", response_model=SyncJobOut, status_code=201)
def trigger_sync(
    integration_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SyncJobOut:
    integration = db.execute(
        select(UserIntegration).where(
            UserIntegration.id == integration_id,
            UserIntegration.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found.")
    if integration.status != "connected":
        raise HTTPException(status_code=422, detail="Integration is not connected. Connect it before syncing.")

    if integration.provider == "google" and integration.service_type in {"calendar", "gmail"}:
        summary = sync_google_service(current_user.id, integration.service_type, db)
        job = db.execute(select(SyncJob).where(SyncJob.id == summary.sync_job_id)).scalar_one()
        return _job_to_out(job)

    now = datetime.now(timezone.utc)
    job = SyncJob(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        integration_id=integration_id,
        provider=integration.provider,
        service_type=integration.service_type,
        status="running",
        started_at=now,
        completed_at=None,
        records_processed=0,
        records_created=0,
        records_updated=0,
        records_skipped=0,
        errors=None,
        error_message=None,
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
        job.error_message = errors[0] if errors else None
        integration.last_sync_at = datetime.now(timezone.utc)
        integration.updated_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        job.status = "failed"
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = "Integration sync failed."
        job.errors = json.dumps(["Integration sync failed."])
        db.commit()
        logger.error("mock_sync_failed provider=%s user_id=%s error_type=%s", integration.provider, current_user.id, type(exc).__name__)

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
