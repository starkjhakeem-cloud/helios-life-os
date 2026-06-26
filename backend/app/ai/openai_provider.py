import json
from datetime import datetime, timezone
from time import perf_counter
from typing import Any

from app.ai.base import AIProvider
from app.ai.name_formatting import enforce_name_formatting
from app.ai.prompts import (
    BRIEFING_SYSTEM,
    ORCHESTRATION_SYSTEM,
    PLAN_SYSTEM,
    build_briefing_user_message,
    build_chat_system,
    build_chat_user_message,
    build_orchestration_user_message,
    build_plan_user_message,
)
from app.ai.types import AIErrorCode, AIProviderHealth, AIProviderResponse, HeliosAIError, utc_timestamp
from app.schemas.ai import BriefingPriority, ChatResponse, DailyBriefing, PlanResponse, PlanStep, RecommendedAction
from app.schemas.autonomy import DailyPlan, SuggestionItem
from app.schemas.orchestration import AgentAssessment, OrchestrationResponse


class OpenAIProvider(AIProvider):
    """
    OpenAI-backed provider. Activated when AI_PROVIDER=openai and OPENAI_API_KEY is set.
    The openai package must be installed: pip install openai
    """

    provider_name = "openai"

    def __init__(self, api_key: str, model: str, timeout_seconds: int = 30) -> None:
        try:
            from openai import OpenAI
            self._client = OpenAI(api_key=api_key, timeout=timeout_seconds)
        except ImportError as exc:
            raise HeliosAIError(
                AIErrorCode.PROVIDER_OFFLINE,
                "openai package is required for OpenAI provider. "
                "Install it: pip install openai",
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
        system: str | None = None,
        history: list[dict] | None = None,
    ) -> list[dict]:
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.extend(history or [])
        messages.append({"role": "user", "content": prompt})
        return messages

    def _usage_dict(self, usage: Any) -> dict[str, Any] | None:
        if usage is None:
            return None
        if hasattr(usage, "model_dump"):
            return usage.model_dump()
        if isinstance(usage, dict):
            return usage
        return None

    def _completion_options(self, max_tokens: int) -> dict[str, Any]:
        model = self._model.lower()
        if model.startswith(("gpt-5", "o1", "o3", "o4")):
            return {"max_completion_tokens": max_tokens}
        return {"temperature": 0.7, "max_tokens": max_tokens}

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
            response = self._client.chat.completions.create(
                model=self._model,
                messages=self._messages(prompt, system=system, history=history),
                **self._completion_options(max_tokens),
            )
            choice = response.choices[0]
            return AIProviderResponse(
                provider=self.provider_name,
                model=self._model,
                content=choice.message.content or "",
                usage=self._usage_dict(getattr(response, "usage", None)),
                finish_reason=getattr(choice, "finish_reason", None),
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
        started = perf_counter()
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=self._messages(prompt, system=system, history=history),
                response_format={"type": "json_object"},
                **self._completion_options(max_tokens),
            )
            choice = response.choices[0]
            content = choice.message.content or ""
            try:
                parsed = json.loads(content)
            except json.JSONDecodeError as exc:
                raise HeliosAIError(
                    AIErrorCode.MALFORMED_RESPONSE,
                    "OpenAI returned a malformed response.",
                    provider=self.provider_name,
                    raw_error=exc,
                ) from exc
            return AIProviderResponse(
                provider=self.provider_name,
                model=self._model,
                content=parsed,
                usage=self._usage_dict(getattr(response, "usage", None)),
                finish_reason=getattr(choice, "finish_reason", None),
                latency_ms=round((perf_counter() - started) * 1000),
                timestamp=utc_timestamp(),
            )
        except Exception as exc:
            raise self.normalize_error(exc) from exc

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
            import openai
        except ImportError:
            return HeliosAIError(
                AIErrorCode.PROVIDER_OFFLINE,
                "OpenAI provider package is not installed.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, openai.AuthenticationError):
            return HeliosAIError(
                AIErrorCode.INVALID_API_KEY,
                "OpenAI authentication failed.",
                provider=self.provider_name,
                retryable=False,
                raw_error=exc,
            )
        if isinstance(exc, openai.RateLimitError):
            return HeliosAIError(
                AIErrorCode.RATE_LIMITED,
                "OpenAI rate limit reached.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, openai.APITimeoutError):
            return HeliosAIError(
                AIErrorCode.TIMEOUT,
                "OpenAI request timed out.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, openai.APIConnectionError):
            return HeliosAIError(
                AIErrorCode.NETWORK_ERROR,
                "Could not reach OpenAI.",
                provider=self.provider_name,
                raw_error=exc,
            )
        if isinstance(exc, openai.APIStatusError):
            if getattr(exc, "status_code", None) in {500, 502, 503, 504}:
                return HeliosAIError(
                    AIErrorCode.PROVIDER_OFFLINE,
                    "OpenAI is temporarily unavailable.",
                    provider=self.provider_name,
                    raw_error=exc,
                )
            return HeliosAIError(
                AIErrorCode.UNKNOWN_ERROR,
                "OpenAI returned an error.",
                provider=self.provider_name,
                raw_error=exc,
            )
        return HeliosAIError(
            AIErrorCode.UNKNOWN_ERROR,
            "OpenAI provider failed.",
            provider=self.provider_name,
            raw_error=exc,
        )

    def _call(
        self,
        system: str,
        user: str,
        max_tokens: int = 1500,
        history: list[dict] | None = None,
    ) -> dict:
        """
        Send a chat completion request and return the parsed JSON response dict.
        history entries are {"role": "user"|"assistant", "content": "..."}.
        """
        import openai

        _ = openai
        return self.generate_json(
            user,
            system=system,
            history=history,
            max_tokens=max_tokens,
        ).content

    def generate_briefing(self, user_name: str, user_context: str | None = None) -> DailyBriefing:
        user_msg = build_briefing_user_message(user_name=user_name, user_context=user_context)
        try:
            data = self._call(system=BRIEFING_SYSTEM, user=user_msg)
            data = enforce_name_formatting(data, user_name)
            return DailyBriefing(
                greeting=data["greeting"],
                summary=data["summary"],
                priorities=[BriefingPriority(**p) for p in data["priorities"]],
                risks=data["risks"],
                focus_block=data["focus_block"],
                recommended_agent=data["recommended_agent"],
                # Email fields — defensive .get() so older responses without these
                # fields degrade gracefully instead of raising KeyError.
                email_summary=data.get("email_summary"),
                important_emails=data.get("important_emails") or [],
                email_risks=data.get("email_risks") or [],
                suggested_email_actions=data.get("suggested_email_actions") or [],
                generated_at=datetime.now(timezone.utc).isoformat(),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"OpenAI briefing response did not match expected schema: {exc}"
            ) from exc

    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
        user_context: str | None = None,
    ) -> PlanResponse:
        user_msg = build_plan_user_message(
            user_name=user_name,
            prompt=prompt,
            horizon=horizon,
            goal_title=goal_title,
            user_context=user_context,
        )
        try:
            data = self._call(system=PLAN_SYSTEM, user=user_msg)
            data = enforce_name_formatting(data, user_name)
            return PlanResponse(
                plan_title=data["plan_title"],
                summary=data["summary"],
                steps=[PlanStep(**s) for s in data["steps"]],
                estimated_timeline=data["estimated_timeline"],
                risks=data["risks"],
                recommendation=data["recommendation"],
                generated_at=datetime.now(timezone.utc).isoformat(),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"OpenAI plan response did not match expected schema: {exc}"
            ) from exc

    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
        user_context: str | None = None,
        history: list[dict] | None = None,
    ) -> ChatResponse:
        system = build_chat_system(user_context=user_context)
        user_msg = build_chat_user_message(
            user_name=user_name,
            message=message,
            context_type=context_type,
        )
        try:
            data = self._call(system=system, user=user_msg, history=history)
            data = enforce_name_formatting(data, user_name)
            # Parse recommended_actions gracefully — malformed entries are dropped rather
            # than failing the whole response, since the reply is still valid.
            recommended_actions: list[RecommendedAction] = []
            raw_actions = data.get("recommended_actions")
            if isinstance(raw_actions, list):
                for item in raw_actions:
                    try:
                        recommended_actions.append(RecommendedAction(**item))
                    except Exception:
                        pass
            return ChatResponse(
                reply=data["reply"],
                suggested_actions=data["suggested_actions"],
                follow_up_questions=data["follow_up_questions"],
                recommended_actions=recommended_actions,
                provider="openai",
                generated_at=datetime.now(timezone.utc).isoformat(),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"OpenAI chat response did not match expected schema: {exc}"
            ) from exc

    def orchestrate_agents(
        self,
        objective: str,
        agents: list[dict],
        user_context: str | None,
        user_name: str,
    ) -> OrchestrationResponse:
        user_msg = build_orchestration_user_message(
            user_name=user_name,
            objective=objective,
            agents=agents,
            user_context=user_context,
        )
        try:
            data = self._call(
                system=ORCHESTRATION_SYSTEM,
                user=user_msg,
                max_tokens=2000,
            )
            data = enforce_name_formatting(data, user_name)
            assessments = [
                AgentAssessment(**item)
                for item in (data.get("agent_assessments") or [])
            ]
            # Parse structured actionable_recommendations defensively — a
            # malformed individual item is dropped rather than failing the
            # whole response, since the core assessment is still valuable.
            actionable: list[RecommendedAction] = []
            for item in (data.get("actionable_recommendations") or []):
                try:
                    actionable.append(RecommendedAction(**item))
                except Exception:
                    pass
            return OrchestrationResponse(
                objective=objective,
                participating_agents=[a["name"] for a in agents],
                agent_assessments=assessments,
                coordinated_plan=data["coordinated_plan"],
                risks=data.get("risks") or [],
                recommended_next_actions=data.get("recommended_next_actions") or [],
                actionable_recommendations=actionable,
                context_scope="openai",
                generated_at=datetime.now(timezone.utc).isoformat(),
                consensus_summary=data.get("consensus_summary") or "",
                disagreements=data.get("disagreements") or [],
                overall_confidence=float(data.get("overall_confidence") or 0.0),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"OpenAI orchestration response did not match expected schema: {exc}"
            ) from exc

    def generate_suggestions(
        self,
        user_name: str,
        user_context: str | None = None,
    ) -> list[SuggestionItem]:
        # Proactive suggestion generation via OpenAI requires a dedicated prompt
        # template and structured output schema — deferred to a future phase.
        # Delegate to mock so the endpoint works regardless of provider configuration.
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().generate_suggestions(user_name, user_context)

    def generate_daily_plan(
        self,
        user_name: str,
        plan_date: str,
        user_context: str | None = None,
    ) -> DailyPlan:
        # Daily plan generation via OpenAI requires a structured output schema —
        # deferred to a future phase. Delegate to mock so the endpoint works
        # regardless of provider configuration.
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider().generate_daily_plan(user_name, plan_date, user_context)
