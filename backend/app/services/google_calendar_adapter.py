"""
Google Calendar API provider adapter.

V2.18 status: STUB mode (_STUB = True).
All methods return deterministic mock data. Token retrieval is architecturally
wired but no HTTP calls are made to the Google Calendar API.

To activate real API calls:
1. Set _STUB = False below.
2. Ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY are in .env.
3. Install google-api-python-client (or rely on the httpx path already written).
4. Wire token refresh logic before each call (check token_expires_at vs. now).

Security invariants (enforced in both stub and live paths):
- Raw token values are NEVER logged.
- Raw token values are NEVER returned from any method.
- Decrypted tokens are used only for the outgoing Authorization header and
  discarded immediately after the request completes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Real sync uses live Google API calls. Mock development sync remains available
# through app.services.sync_simulator and /integrations/{id}/sync.
_STUB: bool = False

_GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3"


# ── Domain types ───────────────────────────────────────────────────────────────

@dataclass
class GoogleCalendarEvent:
    """Provider-neutral representation of a Google Calendar event."""
    id: str
    summary: str
    start: str              # ISO 8601 datetime string
    end: str                # ISO 8601 datetime string
    description: str | None = None
    location: str | None = None
    status: str = "confirmed"
    html_link: str | None = None
    etag: str | None = None
    calendar_id: str = "primary"
    timezone: str | None = None
    attendees: list[dict] | None = None
    raw_metadata: dict | None = None


@dataclass
class GoogleCalendarEventCreate:
    summary: str
    start: str
    end: str
    description: str | None = None
    location: str | None = None


@dataclass
class GoogleCalendarEventUpdate:
    summary: str | None = None
    start: str | None = None
    end: str | None = None
    description: str | None = None
    location: str | None = None


# ── Stub fixtures ──────────────────────────────────────────────────────────────

_STUB_EVENTS: list[dict] = [
    {
        "id": "stub_gcal_evt_001",
        "summary": "Morning Standup",
        "start": "2026-06-13T09:00:00Z",
        "end": "2026-06-13T09:30:00Z",
        "description": "Daily team sync — stub event from GoogleCalendarAdapter",
        "location": None,
        "status": "confirmed",
    },
    {
        "id": "stub_gcal_evt_002",
        "summary": "Project Review",
        "start": "2026-06-14T14:00:00Z",
        "end": "2026-06-14T15:00:00Z",
        "description": "Sprint review — stub event from GoogleCalendarAdapter",
        "location": None,
        "status": "confirmed",
    },
    {
        "id": "stub_gcal_evt_003",
        "summary": "1:1 with Manager",
        "start": "2026-06-15T11:00:00Z",
        "end": "2026-06-15T11:30:00Z",
        "description": "Weekly check-in — stub event from GoogleCalendarAdapter",
        "location": None,
        "status": "confirmed",
    },
]


def _fixture_to_event(data: dict) -> GoogleCalendarEvent:
    return GoogleCalendarEvent(
        id=data["id"],
        summary=data["summary"],
        start=data["start"],
        end=data["end"],
        description=data.get("description"),
        location=data.get("location"),
        status=data.get("status", "confirmed"),
        html_link=f"https://calendar.google.com/calendar/event?eid={data['id']}",
        etag=f'"stub-etag-{data["id"]}"',
        raw_metadata=data,
    )


# ── Adapter ────────────────────────────────────────────────────────────────────

class GoogleCalendarAdapter:
    """
    Adapter between HELIOS and the Google Calendar REST API.

    Each method accepts `user_id` and `db` so that when _STUB=False the adapter
    can look up the user's connected integration row, decrypt the access token,
    and issue authenticated requests.  In stub mode those parameters are unused
    and no DB read occurs.

    The existing calendar CRUD router (app/routers/calendar.py) and sync
    simulator (app/services/sync_simulator.py) are unaffected — they continue
    to write to the local calendar_events table.  This adapter is the future
    path for reading and writing events directly on Google's side.
    """

    # ── Public API ─────────────────────────────────────────────────────────────

    def list_events(
        self,
        user_id: str,
        db: Session,
        max_results: int = 10,
        time_min: datetime | None = None,
        time_max: datetime | None = None,
    ) -> list[GoogleCalendarEvent]:
        """
        Return upcoming events from the user's primary Google Calendar.

        Stub  → returns _STUB_EVENTS regardless of user_id or time bounds.
        Real  → GET /calendars/primary/events with bearer token.
        """
        if _STUB:
            logger.info(
                "google_calendar_adapter.list_events: STUB — returning %d fixture events for user %s.",
                len(_STUB_EVENTS),
                user_id,
            )
            return [_fixture_to_event(e) for e in _STUB_EVENTS[:max_results]]

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        params: dict = {
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if time_min:
            params["timeMin"] = time_min.isoformat()
        if time_max:
            params["timeMax"] = time_max.isoformat()

        resp = httpx.get(
            f"{_GOOGLE_CALENDAR_BASE_URL}/calendars/primary/events",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=10.0,
        )
        _raise_for_google_error(resp)
        return [_parse_api_event(item) for item in resp.json().get("items", [])]

    def create_event(
        self,
        user_id: str,
        db: Session,
        event: GoogleCalendarEventCreate,
    ) -> GoogleCalendarEvent:
        """
        Create a new event on the user's primary Google Calendar.

        Stub  → echoes the input back as a fixture with a deterministic ID.
        Real  → POST /calendars/primary/events with bearer token.
        """
        if _STUB:
            import hashlib

            stub_id = "stub_created_" + hashlib.sha256(
                f"{user_id}:{event.summary}:{event.start}".encode()
            ).hexdigest()[:12]
            logger.info(
                "google_calendar_adapter.create_event: STUB — returning echo for user %s.",
                user_id,
            )
            return GoogleCalendarEvent(
                id=stub_id,
                summary=event.summary,
                start=event.start,
                end=event.end,
                description=event.description,
                location=event.location,
                status="confirmed",
                html_link=f"https://calendar.google.com/calendar/event?eid={stub_id}",
                etag=f'"stub-etag-{stub_id}"',
            )

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        body: dict = {
            "summary": event.summary,
            "start": {"dateTime": event.start, "timeZone": "UTC"},
            "end": {"dateTime": event.end, "timeZone": "UTC"},
        }
        if event.description:
            body["description"] = event.description
        if event.location:
            body["location"] = event.location

        resp = httpx.post(
            f"{_GOOGLE_CALENDAR_BASE_URL}/calendars/primary/events",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
            timeout=10.0,
        )
        _raise_for_google_error(resp)
        return _parse_api_event(resp.json())

    def update_event(
        self,
        user_id: str,
        db: Session,
        event_id: str,
        updates: GoogleCalendarEventUpdate,
    ) -> GoogleCalendarEvent:
        """
        Update an existing event on the user's primary Google Calendar.

        Stub  → finds the fixture event by event_id (or synthesises a base) and
                applies the patch fields in memory.
        Real  → PATCH /calendars/primary/events/{eventId} with bearer token.
        """
        if _STUB:
            logger.info(
                "google_calendar_adapter.update_event: STUB — patching stub for user %s, event %s.",
                user_id,
                event_id,
            )
            now = datetime.now(timezone.utc)
            base: dict = next(
                (dict(e) for e in _STUB_EVENTS if e["id"] == event_id),
                {
                    "id": event_id,
                    "summary": "Stub Event",
                    "start": now.isoformat(),
                    "end": (now + timedelta(hours=1)).isoformat(),
                    "description": None,
                    "location": None,
                    "status": "confirmed",
                },
            )
            if updates.summary is not None:
                base["summary"] = updates.summary
            if updates.start is not None:
                base["start"] = updates.start
            if updates.end is not None:
                base["end"] = updates.end
            if updates.description is not None:
                base["description"] = updates.description
            if updates.location is not None:
                base["location"] = updates.location
            return _fixture_to_event(base)

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        body: dict = {}
        if updates.summary is not None:
            body["summary"] = updates.summary
        if updates.start is not None:
            body["start"] = {"dateTime": updates.start, "timeZone": "UTC"}
        if updates.end is not None:
            body["end"] = {"dateTime": updates.end, "timeZone": "UTC"}
        if updates.description is not None:
            body["description"] = updates.description
        if updates.location is not None:
            body["location"] = updates.location

        resp = httpx.patch(
            f"{_GOOGLE_CALENDAR_BASE_URL}/calendars/primary/events/{event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
            timeout=10.0,
        )
        _raise_for_google_error(resp)
        return _parse_api_event(resp.json())

    def delete_event(
        self,
        user_id: str,
        db: Session,
        event_id: str,
    ) -> bool:
        """
        Delete an event from the user's primary Google Calendar.

        Stub  → logs and returns True; no network call is made.
        Real  → DELETE /calendars/primary/events/{eventId}; returns True on 204.
        """
        if _STUB:
            logger.info(
                "google_calendar_adapter.delete_event: STUB — no-op for user %s, event %s.",
                user_id,
                event_id,
            )
            return True

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        resp = httpx.delete(
            f"{_GOOGLE_CALENDAR_BASE_URL}/calendars/primary/events/{event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        return resp.status_code == 204


# ── Private helpers ────────────────────────────────────────────────────────────

def _get_access_token(user_id: str, db: Session) -> str:
    """
    Retrieve and decrypt the user's Google Calendar access token from the DB.

    Only called when _STUB=False. Raises RuntimeError if no connected
    integration exists or decryption fails.

    NEVER log the returned plaintext value.
    """
    from app.models.integration import UserIntegration
    row = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == "google",
            UserIntegration.service_type == "calendar",
            UserIntegration.status.in_(("connected", "syncing")),
        )
    ).scalar_one_or_none()
    if not row:
        row = db.execute(
            select(UserIntegration).where(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == "google_calendar",
                UserIntegration.status.in_(("connected", "syncing")),
            )
        ).scalar_one_or_none()

    if not row:
        raise RuntimeError(
            f"google_calendar_adapter: no connected integration for user {user_id}."
        )
    if not row.access_token_encrypted:
        raise RuntimeError(
            f"google_calendar_adapter: connected row for user {user_id} has no stored access token."
        )

    try:
        from app.services.google_oauth import ensure_valid_access_token
        return ensure_valid_access_token(row, db)
    except Exception as exc:
        # Log only the exception type — never log ciphertext or key material.
        logger.error(
            "google_calendar_adapter: token decryption failed for user %s (%s).",
            user_id,
            type(exc).__name__,
        )
        raise RuntimeError("google_calendar_adapter: token unavailable.") from exc


def _raise_for_google_error(resp) -> None:
    """Raise RuntimeError with a safe message when the Google API returns an error."""
    if resp.status_code >= 400:
        raise RuntimeError(f"Google Calendar API returned HTTP {resp.status_code}.")


def _parse_api_event(item: dict) -> GoogleCalendarEvent:
    """Map a raw Google Calendar API event dict to a GoogleCalendarEvent."""
    start = item.get("start", {})
    end = item.get("end", {})
    return GoogleCalendarEvent(
        id=item["id"],
        summary=item.get("summary", "(No title)"),
        start=start.get("dateTime") or start.get("date", ""),
        end=end.get("dateTime") or end.get("date", ""),
        description=item.get("description"),
        location=item.get("location"),
        status=item.get("status", "confirmed"),
        html_link=item.get("htmlLink"),
        etag=item.get("etag"),
        calendar_id=item.get("organizer", {}).get("email") or "primary",
        timezone=start.get("timeZone") or end.get("timeZone"),
        attendees=item.get("attendees"),
        raw_metadata=item,
    )


# ── Singleton ──────────────────────────────────────────────────────────────────
# Import and use directly:
#   from app.services.google_calendar_adapter import google_calendar_adapter
google_calendar_adapter = GoogleCalendarAdapter()
