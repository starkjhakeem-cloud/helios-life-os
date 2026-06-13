from abc import ABC, abstractmethod

from app.schemas.ai import ChatResponse, DailyBriefing, PlanResponse
from app.schemas.autonomy import DailyPlan, SuggestionItem
from app.schemas.orchestration import OrchestrationResponse


class AIProvider(ABC):
    @abstractmethod
    def generate_briefing(self, user_name: str, user_context: str | None = None) -> DailyBriefing: ...

    @abstractmethod
    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
        user_context: str | None = None,
    ) -> PlanResponse: ...

    @abstractmethod
    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
        user_context: str | None = None,
        history: list[dict] | None = None,
    ) -> ChatResponse: ...

    @abstractmethod
    def orchestrate_agents(
        self,
        objective: str,
        agents: list[dict],   # [{id, name, role, description}]
        user_context: str | None,
        user_name: str,
    ) -> OrchestrationResponse: ...

    @abstractmethod
    def generate_suggestions(
        self,
        user_name: str,
        user_context: str | None = None,
    ) -> list[SuggestionItem]: ...

    @abstractmethod
    def generate_daily_plan(
        self,
        user_name: str,
        plan_date: str,
        user_context: str | None = None,
    ) -> DailyPlan: ...
