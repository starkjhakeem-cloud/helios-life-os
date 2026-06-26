import json
from time import perf_counter
from typing import Any

from app.ai.base import AIProvider
from app.ai.types import AIErrorCode, AIProviderHealth, AIProviderResponse, HeliosAIError, utc_timestamp
from app.schemas.ai import ChatResponse, DailyBriefing, PlanResponse
from app.schemas.autonomy import DailyPlan, SuggestionItem
from app.schemas.orchestration import OrchestrationResponse


class AnthropicProvider(AIProvider):
    """
    Anthropic-backed provider adapter.

    HELIOS keeps Anthropic as an optional fallback path, but the package is not
    required unless this provider is selected. Domain-specific generation can be
    expanded later; until then the manager can still select, health-check, and
    normalize generic Anthropic calls safely.
    """

    provider_name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout_seconds: int = 30) -> None:
        try:
            from anthropic import Anthropic
            self._client = Anthropic(api_key=api_key, timeout=timeout_seconds)
        except ImportError as exc:
            raise HeliosAIError(
                AIErrorCode.PROVIDER_OFFLINE,
                "Anthropic provider package is not installed.",
                provider=self.provider_name,
                raw_error=exc,
            ) from exc
        self._model = model

    @property
    def model(self) -> str:
        return self._model

    def _messages(
        self,
        prompt: str,
        *,
        history: list[dict] | None = None,
    ) -> list[dict]:
        messages = [item for item in (history or []) if item.get("role") in {"user", "assistant"}]
        messages.append({"role": "user", "content": prompt})
        return messages

    def generate_text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict] | None = None,
        max_tokens: int = 1500,
    ) -> AIProviderResponse:
        started = perf_counter()
        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system or "",
                messages=self._messages(prompt, history=history),
            )
            content = "".join(
                getattr(block, "text", "")
                for block in getattr(response, "content", [])
                if getattr(block, "type", None) == "text"
            )
            return AIProviderResponse(
                provider=self.provider_name,
                model=self._model,
                content=content,
                usage=self._usage_dict(getattr(response, "usage", None)),
                finish_reason=getattr(response, "stop_reason", None),
                latency_ms=round((perf_counter() - started) * 1000),
                timestamp=utc_timestamp(),
            )
        except Exception as exc:
            raise self.normalize_error(exc) from exc

    def generate_json(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict] | None = None,
        max_tokens: int = 1500,
    ) -> AIProviderResponse:
        response = self.generate_text(
            prompt,
            system=system,
            history=history,
            max_tokens=max_tokens,
        )
        try:
            response.content = json.loads(str(response.content))
        except json.JSONDecodeError as exc:
            raise HeliosAIError(
                AIErrorCode.MALFORMED_RESPONSE,
                "Anthropic returned a malformed response.",
                provider=self.provider_name,
                raw_error=exc,
            ) from exc
        return response

    def check_health(self) -> AIProviderHealth:
        started = perf_counter()
        try:
            self.generate_text("Respond with OK.", system="Health check.", max_tokens=8)
            return AIProviderHealth(
                provider=self.provider_name,
                model=self._model,
                healthy=True,
                checked_at=utc_timestamp(),
                latency_ms=round((perf_counter() - started) * 1000),
            )
        except Exception as exc:
            error = self.normalize_error(exc)
            return AIProviderHealth(
                provider=self.provider_name,
                model=self._model,
                healthy=False,
                checked_at=utc_timestamp(),
                error=error.code.value,
                latency_ms=round((perf_counter() - started) * 1000),
            )

    def normalize_error(self, exc: Exception) -> HeliosAIError:
        if isinstance(exc, HeliosAIError):
            return exc
        try:
            import anthropic
        except ImportError:
            return HeliosAIError(
                AIErrorCode.PROVIDER_OFFLINE,
                "Anthropic provider package is not installed.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, getattr(anthropic, "AuthenticationError", ())):
            return HeliosAIError(
                AIErrorCode.INVALID_API_KEY,
                "Anthropic authentication failed.",
                provider=self.provider_name,
                retryable=False,
                raw_error=exc,
            )
        if isinstance(exc, getattr(anthropic, "RateLimitError", ())):
            return HeliosAIError(
                AIErrorCode.RATE_LIMITED,
                "Anthropic rate limit reached.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, getattr(anthropic, "APITimeoutError", ())):
            return HeliosAIError(
                AIErrorCode.TIMEOUT,
                "Anthropic request timed out.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, getattr(anthropic, "APIConnectionError", ())):
            return HeliosAIError(
                AIErrorCode.NETWORK_ERROR,
                "Could not reach Anthropic.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, getattr(anthropic, "APIStatusError", ())):
            status_code = getattr(exc, "status_code", None)
            code = AIErrorCode.PROVIDER_OFFLINE if status_code in {500, 502, 503, 504} else AIErrorCode.UNKNOWN_ERROR
            return HeliosAIError(
                code,
                "Anthropic returned an error.",
                provider=self.provider_name,
                raw_error=exc,
            )
        return HeliosAIError(
            AIErrorCode.UNKNOWN_ERROR,
            "Anthropic provider failed.",
            provider=self.provider_name,
            raw_error=exc,
        )

    def _usage_dict(self, usage: Any) -> dict[str, Any] | None:
        if usage is None:
            return None
        if hasattr(usage, "model_dump"):
            return usage.model_dump()
        if isinstance(usage, dict):
            return usage
        return None

    def generate_briefing(self, user_name: str, user_context: str | None = None) -> DailyBriefing:
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().generate_briefing(user_name, user_context)

    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
        user_context: str | None = None,
    ) -> PlanResponse:
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().generate_plan(prompt, horizon, goal_title, user_name, user_context)

    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
        user_context: str | None = None,
        history: list[dict] | None = None,
    ) -> ChatResponse:
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().generate_chat_reply(message, user_name, context_type, user_context, history)

    def orchestrate_agents(
        self,
        objective: str,
        agents: list[dict],
        user_context: str | None,
        user_name: str,
    ) -> OrchestrationResponse:
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().orchestrate_agents(objective, agents, user_context, user_name)

    def generate_suggestions(
        self,
        user_name: str,
        user_context: str | None = None,
    ) -> list[SuggestionItem]:
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().generate_suggestions(user_name, user_context)

    def generate_daily_plan(
        self,
        user_name: str,
        plan_date: str,
        user_context: str | None = None,
    ) -> DailyPlan:
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().generate_daily_plan(user_name, plan_date, user_context)
