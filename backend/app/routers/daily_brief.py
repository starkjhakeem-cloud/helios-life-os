from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.daily_brief import DailyBriefGenerateRequest, DailyBriefOut
from app.services.daily_brief_service import DailyBriefService

router = APIRouter()


@router.get("/today", response_model=DailyBriefOut)
def get_today_daily_brief(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyBriefOut:
    return DailyBriefService(db).get_or_generate_today(current_user.id)


@router.post("/generate", response_model=DailyBriefOut)
def generate_daily_brief(
    payload: DailyBriefGenerateRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyBriefOut:
    request = payload or DailyBriefGenerateRequest()
    target = request.date
    if target and not request.regenerate:
        existing = DailyBriefService(db).get_daily_brief(current_user.id, target)
        if existing:
            return existing
    return DailyBriefService(db).generate_daily_brief(current_user.id, target)


@router.get("/{target_date}", response_model=DailyBriefOut)
def get_daily_brief_by_date(
    target_date: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DailyBriefOut:
    brief = DailyBriefService(db).get_daily_brief(current_user.id, target_date)
    if not brief:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily brief not found for this date.",
        )
    return brief

