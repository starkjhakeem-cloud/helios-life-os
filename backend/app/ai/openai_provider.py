import json
from datetime import datetime, timezone

from app.ai.base import AIProvider
from app.ai.prompts import (
    BRIEFING_SYSTEM,
    PLAN_SYSTEM,
    build_briefing_user_message,
    build_chat_system,
    build_chat_user_message,
    build_plan_user_message,
)
from app.schemas.ai import BriefingPriority, ChatResponse, DailyBriefing, PlanResponse, PlanStep, RecommendedAction


class OpenAIProvider(AIProvider):
    """
    OpenAI-backed provider. Activated when AI_PROVIDER=openai and OPENAI_API_KEY is set.
    The openai package must be installed: pip install openai
    """

    def __init__(self, api_key: str, model: str) -> None:
        try:
            from openai import OpenAI
            self._client = OpenAI(api_key=api_key)
        except ImportError as exc:
            raise RuntimeError(
                "openai package is required for OpenAI provider. "
                "Install it: pip install openai"
            ) from exc
        self._model = model

    def _call(self, system: str, user: str) -> dict:
        """Send a chat completion request and return the parsed JSON response dict."""
        import openai

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                response_format={"type": "json_object"},
                temperature=0.7,
                max_tokens=1500,
            )
            content = response.choices[0].message.content or ""
            return json.loads(content)
        except openai.AuthenticationError as exc:
            raise RuntimeError(
                "OpenAI authentication failed — verify OPENAI_API_KEY."
            ) from exc
        except openai.RateLimitError as exc:
            raise RuntimeError(
                "OpenAI rate limit reached — try again in a moment."
            ) from exc
        except openai.APIConnectionError as exc:
            raise RuntimeError(
                "Could not reach OpenAI — check your network connection."
            ) from exc
        except openai.APIStatusError as exc:
            raise RuntimeError(
                f"OpenAI API error ({exc.status_code}): {exc.message}"
            ) from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("OpenAI returned malformed JSON.") from exc

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
    ) -> PlanResponse:
        user_msg = build_plan_user_message(
            user_name=user_name,
            prompt=prompt,
            horizon=horizon,
            goal_title=goal_title,
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
                f"OpenAI plan response did not match expected schema: {exc}"
            ) from exc

    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
        user_context: str | None = None,
    ) -> ChatResponse:
        system = build_chat_system(user_context=user_context)
        user_msg = build_chat_user_message(
            user_name=user_name,
            message=message,
            context_type=context_type,
        )
        try:
            data = self._call(system=system, user=user_msg)
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
