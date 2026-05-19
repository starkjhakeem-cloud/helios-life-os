from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardSummary, MetricItem, SectionItem

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(current_user: User = Depends(get_current_user)) -> DashboardSummary:
    # current_user is available here for personalisation in a future phase.
    return DashboardSummary(
        metrics=[
            MetricItem(value="82",     label="Productivity", icon="chart.line.uptrend.xyaxis"),
            MetricItem(value="5h 32m", label="Focus Time",   icon="timer"),
            MetricItem(value="12",     label="Tasks Done",   icon="checkmark.circle.fill"),
            MetricItem(value="68%",    label="Energy",       icon="bolt.fill"),
        ],
        sections=[
            SectionItem(
                title="AI Insight",
                icon="brain",
                content=(
                    "Deep work sessions before noon correlate with higher task completion. "
                    "HELIOS recommends protecting your morning hours for high-priority goals."
                ),
            ),
            SectionItem(
                title="Today's Focus",
                icon="flag.fill",
                content=(
                    "Review your active goals, close out any overdue tasks, "
                    "and use the AI Planner to map your next execution sprint."
                ),
            ),
        ],
        system_status="online",
        last_updated=datetime.now(timezone.utc).isoformat(),
    )
