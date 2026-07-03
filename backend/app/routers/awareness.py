from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.awareness import RealTimeContext
from app.services.awareness_engine import RealTimeAwarenessEngine

router = APIRouter()


@router.get("/current", response_model=RealTimeContext)
def current_awareness(
    date_param: date | None = Query(
        default=None,
        alias="date",
        description="YYYY-MM-DD. Defaults to the user's current local date.",
    ),
    refresh: bool = Query(default=False, description="Bypass the short-lived awareness cache."),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RealTimeContext:
    """Return HELIOS's unified current awareness object for the authenticated user."""
    context = RealTimeAwarenessEngine(db).build_context(
        current_user.id,
        date_param,
        refresh=refresh,
    )
    return RealTimeContext(**context)
