import json
from datetime import datetime, timezone

from app.ai.base import AIProvider
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
from app.schemas.ai import BriefingPriority, ChatResponse, DailyBriefing, PlanResponse, PlanStep, RecommendedAction
from app.schemas.autonomy import DailyPlan, SuggestionItem
from app.schemas.orchestration import AgentAssessment, OrchestrationResponse


class AnthropicProvider(AIProvider):
    """
    Anthropic Claude-backed provider. Activated when AI_PROVIDER=anthropic
    and ANTHROPIC_API_KEY is set in the environment.
    The anthropic package must be installed: pip install anthropic
    """

    def __init__(self, api_key: str, model: str) -> None:
        try:
            import anthropic as anthropic_sdk
            self._client = anthropic_sdk.Anthropic(api_key=api_key)
        except ImportError as exc:
            raise RuntimeError(
                "anthropic package is required for Anthropic provider. "
                "Install it: pip install anthropic"
            ) from exc
        self._model = model

    def _call(
        self,
        system: str,
        user: str,
        max_tokens: int = 1500,
        history: list[dict] | None = None,
    ) -> dict:
        """
        Send a message to Claude and return the parsed JSON response dict.

        If history is provided it is prepended as prior turns so Claude has
        full conversational context. Each entry must be {"role": ..., "content": ...}.
        The current user message is always appended as the final turn.
        """
        import anthropic as anthropic_sdk

        messages: list[dict] = list(history or [])
        messages.append({"role": "user", "content": user})

        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            )
            content = response.content[0].text if response.content else ""
            # Strip any accidental markdown fences Claude might include
            content = content.strip()
            if content.startswith("```"):
                # Strip ```json ... ``` or ``` ... ```
                lines = content.splitlines()
                content = "\n".join(
                    line for line in lines
                    if not line.strip().startswith("```")
                )
            return json.loads(content)
        except anthropic_sdk.AuthenticationError as exc:
            raise RuntimeError(
                "Anthropic authentication failed — verify ANTHROPIC_API_KEY."
            ) from exc
        except anthropic_sdk.RateLimitError as exc:
            raise RuntimeError(
                "Anthropic rate limit reached — try again in a moment."
            ) from exc
        except anthropic_sdk.APIConnectionError as exc:
            raise RuntimeError(
                "Could not reach Anthropic — check your network connection."
            ) from exc
        except anthropic_sdk.APIStatusError as exc:
            raise RuntimeError(
                f"Anthropic API error ({exc.status_code}): {exc.message}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("Anthropic returned malformed JSON.") from exc

    def generate_briefing(self, user_name: str, user_context: str | None = None) -> DailyBriefing:
        user_msg = build_briefing_user_message(user_name=user_name, user_context=user_context)
        try:
            data = self._call(system=BRIEFING_SYSTEM, user=user_msg)
            return DailyBriefing(
                greeting=data["greeting"],
                summary=data["summary"],
                priorities=[BriefingPriority(**p) for p in data["priorities"]],
                risks=data["risks"],
                focus_block=data["focus_block"],
                recommended_agent=data["recommended_agent"],
                email_summary=data.get("email_summary"),
                important_emails=data.get("important_emails") or [],
                email_risks=data.get("email_risks") or [],
                suggested_email_actions=data.get("suggested_email_actions") or [],
                generated_at=datetime.now(timezone.utc).isoformat(),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Anthropic briefing response did not match expected schema: {exc}"
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
                f"Anthropic plan response did not match expected schema: {exc}"
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
            data = self._call(system=system, user=user_msg, max_tokens=1200, history=history)
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
                suggested_actions=data.get("suggested_actions") or [],
                follow_up_questions=data.get("follow_up_questions") or [],
                recommended_actions=recommended_actions,
                provider="claude",
                generated_at=datetime.now(timezone.utc).isoformat(),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Anthropic chat response did not match expected schema: {exc}"
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
            assessments = [
                AgentAssessment(**item)
                for item in (data.get("agent_assessments") or [])
            ]
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
                context_scope="anthropic",
                generated_at=datetime.now(timezone.utc).isoformat(),
                consensus_summary=data.get("consensus_summary") or "",
                disagreements=data.get("disagreements") or [],
                overall_confidence=float(data.get("overall_confidence") or 0.0),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError(
                f"Anthropic orchestration response did not match expected schema: {exc}"
            ) from exc

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
