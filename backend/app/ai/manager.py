import logging
from collections.abc import Callable
from time import perf_counter, sleep
from typing import Any, TypeVar

from app.ai.base import AIProvider
from app.ai.types import AIErrorCode, AIProviderHealth, AIProviderResponse, HeliosAIError, utc_timestamp
from app.schemas.ai import ChatResponse, DailyBriefing, PlanResponse
from app.schemas.autonomy import DailyPlan, SuggestionItem
from app.schemas.orchestration import OrchestrationResponse

logger = logging.getLogger(__name__)

T = TypeVar("T")


class AIProviderManager(AIProvider):
    provider_name = "manager"

    def __init__(
        self,
        *,
        active_provider: str,
        fallback_order: list[str],
        openai_api_key: str | None = None,
        openai_model: str = "gpt-5.5",
        anthropic_api_key: str | None = None,
        anthropic_model: str = "claude-3-5-sonnet-latest",
        timeout_seconds: int = 30,
        max_retries: int = 2,
    ) -> None:
        self.active_provider = self._normalize_name(active_provider)
        self.fallback_order = [self._normalize_name(item) for item in fallback_order]
        self.openai_api_key = openai_api_key
        self.openai_model = openai_model
        self.anthropic_api_key = anthropic_api_key
        self.anthropic_model = anthropic_model
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, max_retries)
        self._health: dict[str, AIProviderHealth] = {}

    @classmethod
    def from_settings(cls, settings: Any) -> "AIProviderManager":
        fallback_order = [
            item.strip()
            for item in str(settings.ai_provider_fallback_order).split(",")
            if item.strip()
        ]
        return cls(
            active_provider=settings.ai_provider,
            fallback_order=fallback_order,
            openai_api_key=settings.openai_api_key,
            openai_model=settings.openai_model,
            anthropic_api_key=settings.anthropic_api_key,
            anthropic_model=settings.anthropic_model,
            timeout_seconds=settings.ai_provider_timeout_seconds,
            max_retries=settings.ai_provider_max_retries,
        )

    @property
    def model(self) -> str:
        return self._model_for(self.active_provider)

    def generate_text(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict] | None = None,
        max_tokens: int = 1500,
    ) -> AIProviderResponse:
        return self._execute(
            "generate_text",
            lambda provider: provider.generate_text(
                prompt,
                system=system,
                history=history,
                max_tokens=max_tokens,
            ),
        )

    def generate_json(
        self,
        prompt: str,
        *,
        system: str | None = None,
        history: list[dict] | None = None,
        max_tokens: int = 1500,
    ) -> AIProviderResponse:
        return self._execute(
            "generate_json",
            lambda provider: provider.generate_json(
                prompt,
                system=system,
                history=history,
                max_tokens=max_tokens,
            ),
        )

    def check_health(self) -> AIProviderHealth:
        try:
            provider = self._build_provider(self.active_provider)
            health = provider.check_health()
            self._health[self.active_provider] = health
            return health
        except Exception as exc:
            error = self.normalize_error(exc)
            health = AIProviderHealth(
                provider=self.active_provider,
                model=self.model,
                healthy=False,
                checked_at=utc_timestamp(),
                error=error.code.value,
            )
            self._health[self.active_provider] = health
            return health

    def normalize_error(self, exc: Exception) -> HeliosAIError:
        if isinstance(exc, HeliosAIError):
            return exc
        return HeliosAIError(
            AIErrorCode.UNKNOWN_ERROR,
            "HELIOS AI provider failed.",
            provider=self.provider_name,
            raw_error=exc,
        )

    def generate_briefing(self, user_name: str, user_context: str | None = None) -> DailyBriefing:
        return self._execute(
            "generate_briefing",
            lambda provider: provider.generate_briefing(user_name, user_context),
        )

    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
        user_context: str | None = None,
    ) -> PlanResponse:
        return self._execute(
            "generate_plan",
            lambda provider: provider.generate_plan(prompt, horizon, goal_title, user_name, user_context),
        )

    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
        user_context: str | None = None,
        history: list[dict] | None = None,
    ) -> ChatResponse:
        return self._execute(
            "generate_chat_reply",
            lambda provider: provider.generate_chat_reply(
                message,
                user_name,
                context_type,
                user_context,
                history,
            ),
        )

    def orchestrate_agents(
        self,
        objective: str,
        agents: list[dict],
        user_context: str | None,
        user_name: str,
    ) -> OrchestrationResponse:
        return self._execute(
            "orchestrate_agents",
            lambda provider: provider.orchestrate_agents(objective, agents, user_context, user_name),
        )

    def generate_suggestions(
        self,
        user_name: str,
        user_context: str | None = None,
    ) -> list[SuggestionItem]:
        return self._execute(
            "generate_suggestions",
            lambda provider: provider.generate_suggestions(user_name, user_context),
        )

    def generate_daily_plan(
        self,
        user_name: str,
        plan_date: str,
        user_context: str | None = None,
    ) -> DailyPlan:
        return self._execute(
            "generate_daily_plan",
            lambda provider: provider.generate_daily_plan(user_name, plan_date, user_context),
        )

    def health_snapshot(self) -> dict[str, AIProviderHealth]:
        return dict(self._health)

    def _execute(self, operation: str, call: Callable[[AIProvider], T]) -> T:
        errors: list[HeliosAIError] = []
        for provider_name in self._provider_order():
            provider: AIProvider | None = None
            try:
                provider = self._build_provider(provider_name)
            except HeliosAIError as exc:
                errors.append(exc)
                self._record_unhealthy(provider_name, exc)
                self._log_failure(operation, provider_name, None, exc, 0, attempt=0)
                continue

            attempts = 1 if not self._can_retry(provider_name) else self.max_retries + 1
            for attempt in range(attempts):
                started = perf_counter()
                try:
                    result = call(provider)
                    latency_ms = round((perf_counter() - started) * 1000)
                    self._record_healthy(provider)
                    logger.info(
                        "ai.provider_success provider=%s model=%s operation=%s latency_ms=%s attempt=%s",
                        provider.provider_name,
                        provider.model,
                        operation,
                        latency_ms,
                        attempt + 1,
                    )
                    return result
                except Exception as exc:
                    latency_ms = round((perf_counter() - started) * 1000)
                    error = provider.normalize_error(exc)
                    errors.append(error)
                    self._record_unhealthy(provider.provider_name, error, provider.model)
                    self._log_failure(
                        operation,
                        provider.provider_name,
                        provider.model,
                        error,
                        latency_ms,
                        attempt=attempt + 1,
                    )
                    if not error.retryable or error.code == AIErrorCode.INVALID_API_KEY:
                        break
                    if attempt < attempts - 1:
                        sleep(min(0.25 * (attempt + 1), 1.0))
            # Only transient failures fall through to later providers. Schema
            # and auth failures are provider-local, so the next fallback may
            # still be able to satisfy the same stable HELIOS contract.

        raise self._unavailable_error(errors)

    def _build_provider(self, provider_name: str) -> AIProvider:
        provider_name = self._normalize_name(provider_name)
        if provider_name == "mock":
            from app.ai.mock_provider import MockAIProvider
            return MockAIProvider()
        if provider_name == "openai":
            if not self.openai_api_key:
                raise HeliosAIError(
                    AIErrorCode.INVALID_API_KEY,
                    "OpenAI API key is not configured.",
                    provider="openai",
                    retryable=False,
                )
            from app.ai.openai_provider import OpenAIProvider
            return OpenAIProvider(
                api_key=self.openai_api_key,
                model=self.openai_model,
                timeout_seconds=self.timeout_seconds,
            )
        if provider_name == "anthropic":
            if not self.anthropic_api_key:
                raise HeliosAIError(
                    AIErrorCode.INVALID_API_KEY,
                    "Anthropic API key is not configured.",
                    provider="anthropic",
                    retryable=False,
                )
            from app.ai.anthropic_provider import AnthropicProvider
            return AnthropicProvider(
                api_key=self.anthropic_api_key,
                model=self.anthropic_model,
                timeout_seconds=self.timeout_seconds,
            )
        raise HeliosAIError(
            AIErrorCode.UNKNOWN_ERROR,
            f"Unsupported AI provider '{provider_name}'.",
            provider=provider_name,
            retryable=False,
        )

    def _provider_order(self) -> list[str]:
        ordered = [self.active_provider, *self.fallback_order]
        deduped: list[str] = []
        for provider_name in ordered:
            normalized = self._normalize_name(provider_name)
            if normalized and normalized not in deduped:
                deduped.append(normalized)
        return deduped or ["mock"]

    def _normalize_name(self, provider_name: str | None) -> str:
        return (provider_name or "mock").strip().lower()

    def _model_for(self, provider_name: str) -> str:
        provider_name = self._normalize_name(provider_name)
        if provider_name == "openai":
            return self.openai_model
        if provider_name == "anthropic":
            return self.anthropic_model
        return "mock"

    def _can_retry(self, provider_name: str) -> bool:
        return provider_name != "mock" and self.max_retries > 0

    def _record_healthy(self, provider: AIProvider) -> None:
        self._health[provider.provider_name] = AIProviderHealth(
            provider=provider.provider_name,
            model=provider.model,
            healthy=True,
            checked_at=utc_timestamp(),
        )

    def _record_unhealthy(
        self,
        provider_name: str,
        error: HeliosAIError,
        model: str | None = None,
    ) -> None:
        self._health[provider_name] = AIProviderHealth(
            provider=provider_name,
            model=model or self._model_for(provider_name),
            healthy=False,
            checked_at=utc_timestamp(),
            error=error.code.value,
        )

    def _log_failure(
        self,
        operation: str,
        provider: str,
        model: str | None,
        error: HeliosAIError,
        latency_ms: int,
        *,
        attempt: int,
    ) -> None:
        logger.warning(
            "ai.provider_failure provider=%s model=%s operation=%s code=%s retryable=%s latency_ms=%s attempt=%s",
            provider,
            model or self._model_for(provider),
            operation,
            error.code.value,
            error.retryable,
            latency_ms,
            attempt,
        )

    def _unavailable_error(self, errors: list[HeliosAIError]) -> HeliosAIError:
        if errors:
            last_code = errors[-1].code
        else:
            last_code = AIErrorCode.PROVIDER_OFFLINE
        return HeliosAIError(
            last_code if last_code != AIErrorCode.INVALID_API_KEY else AIErrorCode.PROVIDER_OFFLINE,
            "HELIOS AI is temporarily unavailable. Please try again shortly.",
            provider=self.provider_name,
            retryable=True,
        )
