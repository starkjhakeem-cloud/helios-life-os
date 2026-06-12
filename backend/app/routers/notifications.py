import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationOut

router = APIRouter()


def _to_out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=n.id,
        user_id=n.user_id,
        event_type=n.event_type,
        title=n.title,
        body=n.body,
        is_read=n.is_read,
        related_queue_item_id=n.related_queue_item_id,
        action_type=n.action_type,
        created_at=n.created_at.isoformat(),
    )


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = Query(default=False, description="Return only unread notifications"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationListResponse:
    """Return notifications for the authenticated user, newest first."""
    query = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        query = query.where(Notification.is_read.is_(False))
    query = query.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    rows = db.execute(query).scalars().all()

    unread_count = db.execute(
        select(func.count()).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    ).scalar_one()

    return NotificationListResponse(
        notifications=[_to_out(r) for r in rows],
        total=len(rows),
        unread_count=unread_count,
    )


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationOut:
    """Mark a single notification as read."""
    n = db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")

    n.is_read = True
    db.commit()
    db.refresh(n)
    return _to_out(n)


@router.patch("/read-all", response_model=NotificationListResponse)
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> NotificationListResponse:
    """Mark all unread notifications for the authenticated user as read."""
    unread = db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
    ).scalars().all()

    for n in unread:
        n.is_read = True
    db.commit()

    rows = db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).scalars().all()

    return NotificationListResponse(
        notifications=[_to_out(r) for r in rows],
        total=len(rows),
        unread_count=0,
    )


@router.delete("/{notification_id}", status_code=204)
def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete a notification."""
    n = db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")

    db.delete(n)
    db.commit()
