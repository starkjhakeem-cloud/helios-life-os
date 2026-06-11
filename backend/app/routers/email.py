import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.email import EmailMessage
from app.models.user import User
from app.schemas.email import (
    EmailMessageCreate,
    EmailMessageOut,
    EmailMessagesResponse,
    EmailMessageUpdate,
)

router = APIRouter()


def _to_out(msg: EmailMessage) -> EmailMessageOut:
    return EmailMessageOut(
        id=msg.id,
        user_id=msg.user_id,
        sender=msg.sender,
        subject=msg.subject,
        snippet=msg.snippet,
        received_at=msg.received_at,
        importance=msg.importance,
        status=msg.status,
        source=msg.source,
        external_message_id=msg.external_message_id,
        created_at=msg.created_at.isoformat(),
        updated_at=msg.updated_at.isoformat(),
    )


@router.get("", response_model=EmailMessagesResponse)
def list_messages(
    status: str | None = Query(default=None, description="Filter by status: unread | read | archived"),
    importance: str | None = Query(default=None, description="Filter by importance: low | normal | high | urgent"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmailMessagesResponse:
    stmt = (
        select(EmailMessage)
        .where(EmailMessage.user_id == current_user.id)
    )
    if status:
        stmt = stmt.where(EmailMessage.status == status)
    if importance:
        stmt = stmt.where(EmailMessage.importance == importance)

    stmt = stmt.order_by(EmailMessage.received_at.desc())
    rows = db.execute(stmt).scalars().all()
    return EmailMessagesResponse(messages=[_to_out(m) for m in rows], total=len(rows))


@router.post("", response_model=EmailMessageOut, status_code=201)
def create_message(
    payload: EmailMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmailMessageOut:
    now = datetime.now(timezone.utc)
    msg = EmailMessage(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        sender=payload.sender,
        subject=payload.subject,
        snippet=payload.snippet,
        received_at=payload.received_at,
        importance=payload.importance,
        status=payload.status,
        source=payload.source,
        external_message_id=payload.external_message_id,
        created_at=now,
        updated_at=now,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _to_out(msg)


@router.patch("/{message_id}", response_model=EmailMessageOut)
def update_message(
    message_id: str,
    payload: EmailMessageUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> EmailMessageOut:
    msg = db.execute(
        select(EmailMessage).where(
            EmailMessage.id == message_id,
            EmailMessage.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")

    if payload.sender is not None:
        msg.sender = payload.sender
    if payload.subject is not None:
        msg.subject = payload.subject
    if payload.snippet is not None:
        msg.snippet = payload.snippet
    if payload.received_at is not None:
        msg.received_at = payload.received_at
    if payload.importance is not None:
        msg.importance = payload.importance
    if payload.status is not None:
        msg.status = payload.status
    if payload.source is not None:
        msg.source = payload.source
    if payload.external_message_id is not None:
        msg.external_message_id = payload.external_message_id

    msg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)
    return _to_out(msg)


@router.delete("/{message_id}", status_code=204)
def delete_message(
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    msg = db.execute(
        select(EmailMessage).where(
            EmailMessage.id == message_id,
            EmailMessage.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")
    db.delete(msg)
    db.commit()
