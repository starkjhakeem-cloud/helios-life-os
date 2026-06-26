from abc import ABC, abstractmethod
from typing import Any, Iterable

from app.schemas.ai import ChatResponse, DailyBriefing, PlanResponse
from app.schemas.autonomy import DailyPlan, SuggestionItem
from app.schemas.orchestration import OrchestrationResponse
from app.ai.types import AIProviderHealth, AIProviderResponse, HeliosAIError


class AIProvider(ABC):
    provider_name: str
    model: str

    @abstractmethod
    def generate_text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict] | None = None,
        max_tokens: int = 1500,
    ) -> AIProviderResponse: ...

    @abstractmethod
    def generate_json(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict] | None = None,
        max_tokens: int = 1500,
    ) -> AIProviderResponse: ...

    def stream_text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict] | None = None,
        max_tokens: int = 1500,
    ) -> Iterable[str]:
        response = self.generate_text(
            prompt,
            system=system,
            history=history,
            max_tokens=max_tokens,
        )
        yield str(response.content)

    @abstractmethod
    def check_health(self) -> AIProviderHealth: ...

    @abstractmethod
    def normalize_error(self, exc: Exception) -> HeliosAIError: ...

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
