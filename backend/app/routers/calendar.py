import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.calendar import CalendarEvent
from app.models.user import User
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventOut,
    CalendarEventsResponse,
    CalendarEventUpdate,
)

router = APIRouter()


def _to_out(event: CalendarEvent) -> CalendarEventOut:
    return CalendarEventOut(
        id=event.id,
        user_id=event.user_id,
        title=event.title,
        description=event.description,
        start_time=event.start_time,
        end_time=event.end_time,
        location=event.location,
        source=event.source,
        external_event_id=event.external_event_id,
        created_at=event.created_at.isoformat(),
        updated_at=event.updated_at.isoformat(),
    )


@router.get("", response_model=CalendarEventsResponse)
def list_events(
    upcoming_only: bool = Query(default=False, description="Return only events whose start_time is >= now (UTC ISO string comparison)."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarEventsResponse:
    stmt = select(CalendarEvent).where(CalendarEvent.user_id == current_user.id)

    if upcoming_only:
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        stmt = stmt.where(CalendarEvent.start_time >= now_iso)

    stmt = stmt.order_by(CalendarEvent.start_time)
    rows = db.execute(stmt).scalars().all()
    return CalendarEventsResponse(events=[_to_out(e) for e in rows], total=len(rows))


@router.post("", response_model=CalendarEventOut, status_code=201)
def create_event(
    payload: CalendarEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarEventOut:
    now = datetime.now(timezone.utc)
    event = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        location=payload.location,
        source=payload.source,
        external_event_id=payload.external_event_id,
        created_at=now,
        updated_at=now,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _to_out(event)


@router.patch("/{event_id}", response_model=CalendarEventOut)
def update_event(
    event_id: str,
    payload: CalendarEventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CalendarEventOut:
    event = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.id == event_id,
            CalendarEvent.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")

    if payload.title is not None:
        event.title = payload.title
    if payload.description is not None:
        event.description = payload.description
    if payload.start_time is not None:
        event.start_time = payload.start_time
    if payload.end_time is not None:
        event.end_time = payload.end_time
    if payload.location is not None:
        event.location = payload.location
    if payload.source is not None:
        event.source = payload.source
    if payload.external_event_id is not None:
        event.external_event_id = payload.external_event_id

    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return _to_out(event)


@router.delete("/{event_id}", status_code=204)
def delete_event(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    event = db.execute(
        select(CalendarEvent).where(
            CalendarEvent.id == event_id,
            CalendarEvent.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    db.delete(event)
    db.commit()
