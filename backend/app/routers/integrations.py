import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.integration import UserIntegration
from app.models.user import User
from app.schemas.integration import IntegrationListResponse, IntegrationOut, MockConnectRequest

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
