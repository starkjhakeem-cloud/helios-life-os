"""
Mock sync simulator for HELIOS external integrations.

Generates stable, deterministic fake records keyed on user_id + provider + index
so that re-running sync upserts (records_updated) rather than duplicating data.
Real sync workers will replace this module's logic while keeping the same
SyncJob row lifecycle: insert "running" → update to "completed"/"failed".
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session


def _stable_ext_id(provider: str, user_id: str, index: int) -> str:
    """Deterministic 20-char hex ID — same user/provider/index always yields the same string."""
    raw = f"{provider}:{user_id}:{index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:20]


# ── Calendar event templates ──────────────────────────────────────────────────
# (title, day_offset, start_hour, duration_hours, description)

_CALENDAR_TEMPLATES = [
    ("Morning Standup",     1, 9,  0.5, "Daily team sync — 30 min"),
    ("Project Review",      2, 14, 1.0, "Sprint review and retrospective"),
    ("1:1 with Manager",    3, 11, 0.5, "Weekly check-in"),
    ("Quarterly Planning",  5, 9,  3.0, "Q3 goals and roadmap alignment"),
    ("Team Workshop",       7, 13, 3.0, "Collaborative design workshop"),
]

# ── Email message templates ───────────────────────────────────────────────────
# (sender, subject, snippet, importance, hours_ago)

_EMAIL_TEMPLATES = [
    (
        "Alex Chen <alex.chen@company.com>",
        "Q3 Budget Review — action required",
        "Please review the attached budget proposal and provide feedback by EOD Friday.",
        "high",
        2,
    ),
    (
        "Sarah Lee <s.lee@company.com>",
        "Updated project timeline",
        "I've updated the project timeline to reflect the new requirements. Key milestones shifted by one week.",
        "normal",
        5,
    ),
    (
        "Michael Torres <m.torres@company.com>",
        "Feedback needed on proposal draft",
        "Can you take a look at the attached proposal before we send it to the client?",
        "high",
        9,
    ),
    (
        "Jennifer Wu <j.wu@company.com>",
        "Interview schedule confirmed",
        "Your interview is confirmed for Thursday at 2 PM. Calendar invite to follow.",
        "normal",
        14,
    ),
    (
        "David Park <d.park@company.com>",
        "Weekly standup notes",
        "Here are the notes from today's standup. Action items are highlighted in bold.",
        "low",
        22,
    ),
]


def _sync_calendar(provider: str, user_id: str, db: Session) -> tuple[int, int, list[str]]:
    from app.models.calendar import CalendarEvent

    source = "google" if provider == "google_calendar" else "outlook"
    now = datetime.now(timezone.utc)
    created = updated = 0

    for i, (title, day_offset, start_hour, duration_h, description) in enumerate(_CALENDAR_TEMPLATES):
        ext_id = f"{source}-cal-{_stable_ext_id(provider, user_id, i)}"
        start_dt = (now + timedelta(days=day_offset)).replace(
            hour=start_hour, minute=0, second=0, microsecond=0
        )
        end_dt = start_dt + timedelta(hours=duration_h)
        start_str = start_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        existing = db.execute(
            select(CalendarEvent).where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.external_event_id == ext_id,
            )
        ).scalar_one_or_none()

        if existing:
            existing.title = title
            existing.description = description
            existing.start_time = start_str
            existing.end_time = end_str
            existing.updated_at = now
            updated += 1
        else:
            db.add(
                CalendarEvent(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    title=title,
                    description=description,
                    start_time=start_str,
                    end_time=end_str,
                    location=None,
                    source=source,
                    external_event_id=ext_id,
                    created_at=now,
                    updated_at=now,
                )
            )
            created += 1

    return created, updated, []


def _sync_email(provider: str, user_id: str, db: Session) -> tuple[int, int, list[str]]:
    from app.models.email import EmailMessage

    source = "gmail" if provider == "gmail" else "outlook"
    now = datetime.now(timezone.utc)
    created = updated = 0

    for i, (sender, subject, snippet, importance, hours_ago) in enumerate(_EMAIL_TEMPLATES):
        ext_id = f"{source}-msg-{_stable_ext_id(provider, user_id, i)}"
        received_str = (now - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")

        existing = db.execute(
            select(EmailMessage).where(
                EmailMessage.user_id == user_id,
                EmailMessage.external_message_id == ext_id,
            )
        ).scalar_one_or_none()

        if existing:
            existing.sender = sender
            existing.subject = subject
            existing.snippet = snippet
            existing.updated_at = now
            updated += 1
        else:
            db.add(
                EmailMessage(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    sender=sender,
                    subject=subject,
                    snippet=snippet,
                    received_at=received_str,
                    importance=importance,
                    status="unread",
                    source=source,
                    external_message_id=ext_id,
                    created_at=now,
                    updated_at=now,
                )
            )
            created += 1

    return created, updated, []


def run_mock_sync(provider: str, user_id: str, db: Session) -> tuple[int, int, list[str]]:
    """
    Run a mock sync for the given provider. Returns (records_created, records_updated, errors).
    Upserts stable fake records into calendar_events or email_messages.
    The import of CalendarEvent/EmailMessage is deferred to each helper to avoid
    circular-import issues at module load time.
    """
    if provider in ("google_calendar", "outlook_calendar"):
        return _sync_calendar(provider, user_id, db)
    if provider in ("gmail", "outlook_mail"):
        return _sync_email(provider, user_id, db)
    return 0, 0, [f"Unknown provider: {provider}"]
