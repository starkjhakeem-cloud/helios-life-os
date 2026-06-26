from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.calendar import CalendarEvent
from app.models.email import EmailMessage
from app.models.integration import UserIntegration
from app.models.sync_job import SyncJob
from app.services.gmail_adapter import GmailMessage, gmail_adapter
from app.services.google_calendar_adapter import GoogleCalendarEvent, google_calendar_adapter
from app.services.integration_errors import IntegrationError, IntegrationErrorCode


@dataclass
class SyncSummary:
    provider: str
    service_type: str
    status: str
    started_at: str
    completed_at: str | None
    records_created: int
    records_updated: int
    records_skipped: int
    error_message: str | None
    sync_job_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "service_type": self.service_type,
            "status": self.status,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "records_created": self.records_created,
            "records_updated": self.records_updated,
            "records_skipped": self.records_skipped,
            "error_message": self.error_message,
            "sync_job_id": self.sync_job_id,
        }


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_time(value: str | None) -> str:
    if not value:
        return _iso_now()
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError, IndexError):
        return value


def _get_connected_account(user_id: str, service_type: str, db: Session) -> UserIntegration:
    account = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == "google",
            UserIntegration.service_type == service_type,
        )
    ).scalar_one_or_none()
    if not account:
        # Compatibility with pre-service_type rows.
        legacy_provider = "google_calendar" if service_type == "calendar" else "gmail"
        account = db.execute(
            select(UserIntegration).where(
                UserIntegration.user_id == user_id,
                UserIntegration.provider == legacy_provider,
            )
        ).scalar_one_or_none()
    if not account:
        raise IntegrationError(
            IntegrationErrorCode.MISSING_CREDENTIALS,
            f"Google {service_type} is not connected.",
            status_code=404,
            service_type=service_type,
        )
    if account.status != "connected":
        raise IntegrationError(
            IntegrationErrorCode.TOKEN_EXPIRED,
            f"Google {service_type} needs attention. Please reconnect.",
            status_code=422,
            service_type=service_type,
        )
    return account


def _create_job(user_id: str, account: UserIntegration, service_type: str, db: Session) -> SyncJob:
    now = datetime.now(timezone.utc)
    account.status = "syncing"
    account.updated_at = now
    job = SyncJob(
        id=str(uuid.uuid4()),
        user_id=user_id,
        integration_id=account.id,
        provider="google",
        service_type=service_type,
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
    return job


def _finish_job(
    job: SyncJob,
    account: UserIntegration,
    db: Session,
    *,
    status: str,
    created: int = 0,
    updated: int = 0,
    skipped: int = 0,
    error_message: str | None = None,
    account_status: str | None = None,
) -> SyncSummary:
    completed_at = datetime.now(timezone.utc)
    job.status = status
    job.completed_at = completed_at
    job.records_created = created
    job.records_updated = updated
    job.records_skipped = skipped
    job.records_processed = created + updated + skipped
    job.error_message = error_message
    job.errors = json.dumps([error_message]) if error_message else None
    account.status = "connected" if status == "completed" else (account_status or "error")
    account.last_sync_at = completed_at if status == "completed" else account.last_sync_at
    account.updated_at = completed_at
    db.commit()
    return SyncSummary(
        provider=job.provider,
        service_type=job.service_type or "",
        status=job.status,
        started_at=job.started_at.isoformat(),
        completed_at=completed_at.isoformat(),
        records_created=created,
        records_updated=updated,
        records_skipped=skipped,
        error_message=error_message,
        sync_job_id=job.id,
    )


def _upsert_calendar_events(
    user_id: str,
    account: UserIntegration,
    events: list[GoogleCalendarEvent],
    db: Session,
) -> tuple[int, int, int]:
    now = datetime.now(timezone.utc)
    created = updated = skipped = 0
    for event in events:
        if not event.id or not event.start or not event.end:
            skipped += 1
            continue
        existing = db.execute(
            select(CalendarEvent).where(
                CalendarEvent.user_id == user_id,
                CalendarEvent.source == "google",
                CalendarEvent.external_event_id == event.id,
            )
        ).scalar_one_or_none()
        if existing:
            existing.title = event.summary or "(No title)"
            existing.description = event.description
            existing.location = event.location
            existing.start_time = event.start
            existing.end_time = event.end
            existing.calendar_id = event.calendar_id
            existing.timezone = event.timezone
            existing.attendees = event.attendees
            existing.source_account_id = account.id
            existing.raw_metadata = event.raw_metadata
            existing.updated_at = now
            updated += 1
        else:
            db.add(CalendarEvent(
                id=str(uuid.uuid4()),
                user_id=user_id,
                title=event.summary or "(No title)",
                description=event.description,
                location=event.location,
                start_time=event.start,
                end_time=event.end,
                source="google",
                external_event_id=event.id,
                calendar_id=event.calendar_id,
                timezone=event.timezone,
                attendees=event.attendees,
                source_account_id=account.id,
                raw_metadata=event.raw_metadata,
                created_at=now,
                updated_at=now,
            ))
            created += 1
    return created, updated, skipped


def _upsert_gmail_messages(
    user_id: str,
    account: UserIntegration,
    messages: list[GmailMessage],
    db: Session,
) -> tuple[int, int, int]:
    now = datetime.now(timezone.utc)
    created = updated = skipped = 0
    for message in messages:
        if not message.id:
            skipped += 1
            continue
        existing = db.execute(
            select(EmailMessage).where(
                EmailMessage.user_id == user_id,
                EmailMessage.source == "gmail",
                EmailMessage.external_message_id == message.id,
            )
        ).scalar_one_or_none()
        status = "unread" if message.is_unread else "read"
        received_at = _normalize_time(message.received_at)
        if existing:
            existing.sender = message.sender
            existing.subject = message.subject
            existing.snippet = message.snippet
            existing.received_at = received_at
            existing.importance = message.importance
            existing.status = status
            existing.thread_id = message.thread_id
            existing.recipients = message.recipients
            existing.labels = message.label_ids
            existing.has_attachments = message.has_attachments
            existing.source_account_id = account.id
            existing.raw_metadata = message.raw_metadata
            existing.updated_at = now
            updated += 1
        else:
            db.add(EmailMessage(
                id=str(uuid.uuid4()),
                user_id=user_id,
                sender=message.sender,
                subject=message.subject,
                snippet=message.snippet,
                received_at=received_at,
                importance=message.importance,
                status=status,
                source="gmail",
                external_message_id=message.id,
                thread_id=message.thread_id,
                recipients=message.recipients,
                labels=message.label_ids,
                has_attachments=message.has_attachments,
                source_account_id=account.id,
                raw_metadata=message.raw_metadata,
                created_at=now,
                updated_at=now,
            ))
            created += 1
    return created, updated, skipped


def sync_google_service(user_id: str, service_type: str, db: Session) -> SyncSummary:
    account = _get_connected_account(user_id, service_type, db)
    job = _create_job(user_id, account, service_type, db)
    try:
        if service_type == "calendar":
            now = datetime.now(timezone.utc)
            events = google_calendar_adapter.list_events(
                user_id=user_id,
                db=db,
                max_results=250,
                time_min=now - timedelta(days=30),
                time_max=now + timedelta(days=90),
            )
            created, updated, skipped = _upsert_calendar_events(user_id, account, events, db)
        elif service_type == "gmail":
            messages = gmail_adapter.search_messages(
                user_id=user_id,
                db=db,
                query="newer_than:14d is:important",
                max_results=50,
            )
            created, updated, skipped = _upsert_gmail_messages(user_id, account, messages, db)
        else:
            raise IntegrationError(
                IntegrationErrorCode.UNKNOWN_ERROR,
                "Unsupported Google service type.",
                status_code=422,
                service_type=service_type,
            )
        return _finish_job(job, account, db, status="completed", created=created, updated=updated, skipped=skipped)
    except IntegrationError as exc:
        attention_codes = {
            IntegrationErrorCode.TOKEN_EXPIRED,
            IntegrationErrorCode.REFRESH_FAILED,
            IntegrationErrorCode.INVALID_GRANT,
        }
        return _finish_job(
            job,
            account,
            db,
            status="failed",
            error_message=exc.message,
            account_status="needs_attention" if exc.code in attention_codes else "error",
        )
    except Exception:
        return _finish_job(
            job,
            account,
            db,
            status="failed",
            error_message="Google sync failed. Please try again.",
        )


def sync_google(user_id: str, service_type: str, db: Session) -> list[SyncSummary]:
    services = ["calendar", "gmail"] if service_type == "both" else [service_type]
    return [sync_google_service(user_id, service, db) for service in services]
