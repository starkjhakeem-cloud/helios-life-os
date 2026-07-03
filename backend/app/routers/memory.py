import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.memory import AIMemory
from app.models.user import User
from app.schemas.memory import VALID_MEMORY_TYPES, MemoriesResponse, MemoryCreate, MemoryOut

router = APIRouter()

# Soft cap: prevents unbounded growth while keeping the feature usable.
_MAX_MEMORIES_PER_USER = 200


def _to_out(mem: AIMemory) -> MemoryOut:
    return MemoryOut(
        id=mem.id,
        user_id=mem.user_id,
        memory_type=mem.memory_type,
        content=mem.content,
        extra_data=mem.extra_data,
        created_at=mem.created_at.isoformat(),
        updated_at=mem.updated_at.isoformat(),
    )


@router.get("", response_model=MemoriesResponse)
def list_memories(
    memory_type: str | None = Query(
        default=None,
        description=(
            "Filter by type: preference | goal_context | important_fact | relationship | "
            "project | routine | interest | constraint"
        ),
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoriesResponse:
    if memory_type and memory_type not in VALID_MEMORY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid memory_type. Valid values: {', '.join(sorted(VALID_MEMORY_TYPES))}",
        )

    query = select(AIMemory).where(AIMemory.user_id == current_user.id)
    if memory_type:
        query = query.where(AIMemory.memory_type == memory_type)
    query = query.order_by(AIMemory.created_at.desc())

    rows = db.execute(query).scalars().all()
    return MemoriesResponse(memories=[_to_out(m) for m in rows], total=len(rows))


@router.post("", response_model=MemoryOut, status_code=201)
def create_memory(
    payload: MemoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MemoryOut:
    count: int = db.execute(
        select(func.count()).select_from(AIMemory).where(AIMemory.user_id == current_user.id)
    ).scalar_one()

    if count >= _MAX_MEMORIES_PER_USER:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Memory limit reached ({_MAX_MEMORIES_PER_USER} entries). "
                "Delete existing memories before adding new ones."
            ),
        )

    now = datetime.now(timezone.utc)
    mem = AIMemory(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        memory_type=payload.memory_type,
        content=payload.content,
        extra_data=payload.extra_data,
        created_at=now,
        updated_at=now,
    )
    db.add(mem)
    db.commit()
    db.refresh(mem)
    return _to_out(mem)


@router.delete("/{memory_id}", status_code=204)
def delete_memory(
    memory_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    mem = db.execute(
        select(AIMemory).where(AIMemory.id == memory_id, AIMemory.user_id == current_user.id)
    ).scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found.")
    db.delete(mem)
    db.commit()
