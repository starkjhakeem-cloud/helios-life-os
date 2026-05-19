from abc import ABC, abstractmethod

from app.schemas.ai import DailyBriefing, PlanResponse


class AIProvider(ABC):
    @abstractmethod
    def generate_briefing(self, user_name: str) -> DailyBriefing: ...

    @abstractmethod
    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
    ) -> PlanResponse: ...
