from pydantic import BaseModel


class AnalyticsSummary(BaseModel):
    # Goals
    total_goals: int
    completed_goals: int
    active_goals: int
    paused_goals: int
    goal_completion_rate: float

    # Tasks
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    todo_tasks: int
    overdue_tasks: int
    high_priority_tasks: int
    task_completion_rate: float

    generated_at: str
