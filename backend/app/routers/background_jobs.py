import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.context_service import ContextScope, build_context
from app.ai.factory import get_ai_provider
from app.ai.types import HeliosAIError
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.autonomy import AutonomyQueueItem
from app.models.background_job import BackgroundJob
from app.models.notification import Notification
from app.models.user import User
from app.schemas.background_job import (
    BackgroundJobCreate,
    BackgroundJobListResponse,
    BackgroundJobOut,
    BackgroundJobTriggerResult,
    BackgroundJobUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/background-jobs", tags=["background-jobs"])


def _ai_error_detail(exc: RuntimeError) -> str | dict:
    if isinstance(exc, HeliosAIError):
        return exc.public_detail()
    return "HELIOS AI is temporarily unavailable. Please try again shortly."


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


def _emit(
    db: Session,
    user_id: str,
    event_type: str,
    title: str,
    body: str | None,
    now: datetime,
) -> None:
    """Silently create an in-app notification without blocking the caller."""
    try:
        n = Notification(
            id=str(uuid.uuid4()),
            user_id=user_id,
            event_type=event_type,
            title=title,
            body=body,
            is_read=False,
            created_at=now,
        )
        db.add(n)
        db.commit()
    except Exception:
        logger.exception("Failed to emit notification (event=%s)", event_type)
        try:
            db.rollback()
        except Exception:
            pass


# ── Job-type handlers ─────────────────────────────────────────────────────────

def _run_daily_briefing(
    db: Session,
    current_user: User,
    now: datetime,
) -> tuple[str, int]:
    """
    Generate a daily briefing for the user and emit a notification.
    The briefing itself is not persisted — users retrieve it live from the home screen.
    This records that the scheduled generation ran and notifies the user.
    """
    ctx = build_context(
        ContextScope.DAILY_BRIEFING,
        user_id=current_user.id,
        db=db,
        user_name=current_user.name,
    )
    briefing = get_ai_provider().generate_briefing(
        user_name=current_user.name,
        user_context=ctx.text,
    )
    summary = briefing.summary[:120] + "…" if len(briefing.summary) > 120 else briefing.summary
    _emit(
        db, current_user.id, "execution_completed",
        "Daily Briefing Generated",
        f"Your scheduled briefing is ready. {briefing.greeting}",
        now,
    )
    return f"Briefing generated: {summary}", 0


def _run_proactive_scan(
    db: Session,
    current_user: User,
    now: datetime,
) -> tuple[str, int]:
    """
    Run a proactive suggestion scan. Each generated suggestion is placed in the
    autonomy queue as a pending item requiring manual review. No auto-execution occurs.
    """
    planning_ctx = build_context(
        ContextScope.PLANNING,
        user_id=current_user.id,
        db=db,
        user_name=current_user.name,
    )
    suggestions = get_ai_provider().generate_suggestions(
        user_name=current_user.name,
        user_context=planning_ctx.text,
    )
    items_created = 0
    for suggestion in suggestions:
        item = AutonomyQueueItem(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            title=suggestion.title,
            description=suggestion.description,
            source_agent=suggestion.source_agent,
            proposed_action_type=suggestion.suggested_action_type,
            payload_preview=suggestion.payload_preview,
            risk_level=suggestion.risk_level,
            status="pending",
            created_at=now,
            updated_at=now,
        )
        db.add(item)
        items_created += 1
    if items_created:
        db.commit()
        _emit(
            db, current_user.id, "new_suggestion",
            "Proactive Scan Complete",
            f"HELIOS identified {items_created} suggestion{'' if items_created == 1 else 's'} "
            "and added them to your queue for review.",
            now,
        )
    return f"Scan complete — {items_created} suggestion(s) queued for review.", items_created


def _run_reminder_check(
    db: Session,
    current_user: User,
    now: datetime,
) -> tuple[str, int]:
    """Check reminder status and notify the user of any active reminders."""
    from app.models.reminder import Reminder
    active_count = db.execute(
        select(func.count()).select_from(Reminder).where(
            Reminder.user_id == current_user.id,
        )
    ).scalar_one()
    msg = f"Reminder check complete — {active_count} active reminder{'s' if active_count != 1 else ''} found."
    if active_count > 0:
        _emit(
            db, current_user.id, "execution_completed",
            "Reminder Check",
            f"You have {active_count} active reminder{'' if active_count == 1 else 's'}. Open the Reminders section to review.",
            now,
        )
    return msg, 0


def _run_integration_sync(
    db: Session,
    current_user: User,
    now: datetime,
) -> tuple[str, int]:
    """Simulate an integration sync. No external API calls are made."""
    from app.models.integration import Integration
    integration_count = db.execute(
        select(func.count()).select_from(Integration).where(
            Integration.user_id == current_user.id,
        )
    ).scalar_one()
    msg = (
        f"Integration sync simulated — {integration_count} integration"
        f"{'s' if integration_count != 1 else ''} on record. "
        "No external API calls were made."
    )
    _emit(
        db, current_user.id, "execution_completed",
        "Integration Sync Simulated",
        msg,
        now,
    )
    return msg, 0


# ── CRUD endpoints ────────────────────────────────────────────────────────────

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


@router.post("/{job_id}/trigger", response_model=BackgroundJobTriggerResult)
def trigger_background_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BackgroundJobTriggerResult:
    """
    Manually trigger a background job run.

    For daily_briefing_generation: generates a fresh briefing and notifies the user.
    For proactive_suggestion_scan: scans context and queues all generated suggestions
      as pending queue items requiring manual review — no auto-execution.
    For reminder_check: checks active reminders and notifies.
    For integration_sync_simulation: records a simulated sync — no external calls.

    The job must be enabled. status is set to 'running' during execution and back
    to 'idle' on completion. 'failed' is set if the AI provider raises an error.
    """
    job = db.execute(
        select(BackgroundJob).where(
            BackgroundJob.id == job_id,
            BackgroundJob.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Background job not found.")
    if not job.enabled:
        raise HTTPException(status_code=409, detail="Background job is disabled. Enable it before triggering.")

    now = datetime.now(timezone.utc)
    job.status = "running"
    job.last_run_at = now
    db.commit()

    result_summary = ""
    items_created = 0

    try:
        if job.job_type == "daily_briefing_generation":
            result_summary, items_created = _run_daily_briefing(db, current_user, now)
        elif job.job_type == "proactive_suggestion_scan":
            result_summary, items_created = _run_proactive_scan(db, current_user, now)
        elif job.job_type == "reminder_check":
            result_summary, items_created = _run_reminder_check(db, current_user, now)
        elif job.job_type == "integration_sync_simulation":
            result_summary, items_created = _run_integration_sync(db, current_user, now)
        else:
            result_summary = f"Unknown job type '{job.job_type}' — no action taken."
    except RuntimeError as exc:
        logger.exception("Background job trigger failed (job_id=%s, job_type=%s)", job_id, job.job_type)
        job.status = "failed"
        db.commit()
        raise HTTPException(status_code=502, detail=_ai_error_detail(exc))

    job.status = "idle"
    db.commit()

    return BackgroundJobTriggerResult(
        job_id=job.id,
        job_type=job.job_type,
        triggered_at=now.isoformat(),
        result_summary=result_summary,
        items_created=items_created,
    )
