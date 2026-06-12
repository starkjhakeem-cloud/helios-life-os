import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.autonomy import AutonomyQueueItem
from app.models.user import User
from app.schemas.autonomy import (
    AutonomyQueueItemCreate,
    AutonomyQueueItemOut,
    AutonomyQueueListResponse,
    AutonomyQueueStatusUpdate,
)

router = APIRouter()

_VALID_STATUSES = {"pending", "approved", "rejected", "completed"}


def _to_out(item: AutonomyQueueItem) -> AutonomyQueueItemOut:
    return AutonomyQueueItemOut(
        id=item.id,
        user_id=item.user_id,
        title=item.title,
        description=item.description,
        source_agent=item.source_agent,
        proposed_action_type=item.proposed_action_type,
        payload_preview=item.payload_preview,
        risk_level=item.risk_level,
        status=item.status,
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
    )


@router.get("", response_model=AutonomyQueueListResponse)
def list_queue(
    status: str | None = Query(default=None, description="Filter by status: pending | approved | rejected | completed"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyQueueListResponse:
    if status and status not in _VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid values: {', '.join(sorted(_VALID_STATUSES))}",
        )

    query = select(AutonomyQueueItem).where(AutonomyQueueItem.user_id == current_user.id)
    if status:
        query = query.where(AutonomyQueueItem.status == status)
    query = query.order_by(AutonomyQueueItem.created_at.desc())

    rows = db.execute(query).scalars().all()
    return AutonomyQueueListResponse(items=[_to_out(r) for r in rows], total=len(rows))


@router.post("", response_model=AutonomyQueueItemOut, status_code=201)
def create_queue_item(
    payload: AutonomyQueueItemCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyQueueItemOut:
    now = datetime.now(timezone.utc)
    item = AutonomyQueueItem(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        source_agent=payload.source_agent,
        proposed_action_type=payload.proposed_action_type,
        payload_preview=payload.payload_preview,
        risk_level=payload.risk_level,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.patch("/{item_id}", response_model=AutonomyQueueItemOut)
def update_queue_item_status(
    item_id: str,
    payload: AutonomyQueueStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AutonomyQueueItemOut:
    item = db.execute(
        select(AutonomyQueueItem).where(
            AutonomyQueueItem.id == item_id,
            AutonomyQueueItem.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found.")

    item.status = payload.status
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.delete("/{item_id}", status_code=204)
def delete_queue_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    item = db.execute(
        select(AutonomyQueueItem).where(
            AutonomyQueueItem.id == item_id,
            AutonomyQueueItem.user_id == current_user.id,
        )
    ).scalar_one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Queue item not found.")

    db.delete(item)
    db.commit()
