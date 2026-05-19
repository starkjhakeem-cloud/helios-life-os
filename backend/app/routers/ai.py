from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.ai import BriefingPriority, DailyBriefing

router = APIRouter()


@router.get("/briefing", response_model=DailyBriefing)
def get_daily_briefing(current_user: User = Depends(get_current_user)) -> DailyBriefing:
    # current_user is available here for personalisation once an LLM is wired in.
    return DailyBriefing(
        summary=(
            f"Good session, {current_user.name}. Operational profile shows strong technical "
            "momentum across all systems. Authentication architecture reached a significant "
            "milestone with JWT integration. System stability is nominal. "
            "Engineering velocity is high — maintain current cadence for optimal output."
        ),
        priorities=[
            BriefingPriority(
                label="Complete Phase 12 AI integration",
                detail="Finalize the briefing pipeline and validate all protected endpoints end-to-end.",
            ),
            BriefingPriority(
                label="Review JWT token lifecycle",
                detail="Audit expiry windows and prepare the refresh token architecture for Phase 13.",
            ),
            BriefingPriority(
                label="Commit all backend milestones",
                detail="Ensure Phases 9–12 are committed and documented before the next sprint.",
            ),
        ],
        risks=[
            "Access tokens expire after 60 minutes — implement refresh tokens to prevent session loss.",
            "Dashboard metrics are currently static — live data requires user activity tracking.",
        ],
        recommendation=(
            "Sustain current sprint velocity. The authentication and database layers are "
            "production-ready. Phase 13 refresh tokens will complete the security foundation "
            "and unlock persistent sessions for all operators."
        ),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
