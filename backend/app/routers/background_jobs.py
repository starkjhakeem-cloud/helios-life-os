import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.background_job import BackgroundJob
from app.models.user import User
from app.schemas.background_job import (
    BackgroundJobCreate,
    BackgroundJobListResponse,
    BackgroundJobOut,
    BackgroundJobUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/background-jobs", tags=["background-jobs"])


def _job_to_out(job: BackgroundJob) -> BackgroundJobOut:
    return BackgroundJobOut(
        id=job.id,
        user_id=job.user_id,
        job_type=job.job_type,
        status=job.status,
        schedule_label=job.schedule_label,
        last_run_at=job.last_run_at.isoformat() if job.last_run_at else None,
        next_run_at=job.next_run_at.isoformat() if job.next_run_at else None,
        enabled=job.enabled,
        created_at=job.created_at.isoformat(),
    )


@router.get("", response_model=BackgroundJobListResponse)
def list_background_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jobs = (
        db.execute(
            select(BackgroundJob)
            .where(BackgroundJob.user_id == current_user.id)
            .order_by(BackgroundJob.created_at)
        )
        .scalars()
        .all()
    )
    total = db.execute(
        select(func.count())
        .select_from(BackgroundJob)
        .where(BackgroundJob.user_id == current_user.id)
    ).scalar_one()
    return BackgroundJobListResponse(jobs=[_job_to_out(j) for j in jobs], total=total)


@router.post("", response_model=BackgroundJobOut, status_code=201)
def create_background_job(
    body: BackgroundJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.execute(
        select(BackgroundJob).where(
            BackgroundJob.user_id == current_user.id,
            BackgroundJob.job_type == body.job_type,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A job of type '{body.job_type}' already exists.",
        )

    job = BackgroundJob(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        job_type=body.job_type,
        status="idle",
        schedule_label=body.schedule_label,
        enabled=body.enabled,
        created_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _job_to_out(job)


@router.patch("/{job_id}", response_model=BackgroundJobOut)
def update_background_job(
    job_id: str,
    body: BackgroundJobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.execute(
        select(BackgroundJob).where(
            BackgroundJob.id == job_id,
            BackgroundJob.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Background job not found.")

    if body.enabled is not None:
        job.enabled = body.enabled
    if body.schedule_label is not None:
        job.schedule_label = body.schedule_label

    db.commit()
    db.refresh(job)
    return _job_to_out(job)


@router.delete("/{job_id}", status_code=204)
def delete_background_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.execute(
        select(BackgroundJob).where(
            BackgroundJob.id == job_id,
            BackgroundJob.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Background job not found.")

    db.delete(job)
    db.commit()
