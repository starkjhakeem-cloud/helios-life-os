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
                    "You are most productive between 9 AM and 12 PM. "
                    "HELIOS recommends scheduling deep work during that window."
                ),
            ),
            SectionItem(
                title="Today's Mission",
                icon="flag.fill",
                content=(
                    "Build the first mobile dashboard, commit your progress, "
                    "and prepare the backend foundation."
                ),
            ),
        ],
        system_status="online",
        last_updated=datetime.now(timezone.utc).isoformat(),
    )
