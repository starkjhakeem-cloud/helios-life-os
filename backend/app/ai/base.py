from abc import ABC, abstractmethod

from app.schemas.ai import ChatResponse, DailyBriefing, PlanResponse


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

    @abstractmethod
    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
    ) -> ChatResponse: ...
