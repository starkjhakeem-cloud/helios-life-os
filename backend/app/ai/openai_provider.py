import json
from datetime import datetime, timezone

from app.ai.base import AIProvider
from app.schemas.ai import BriefingPriority, ChatResponse, DailyBriefing, PlanResponse, PlanStep, RecommendedAction

_BRIEFING_SYSTEM = """\
You are HELIOS, an elite AI life-operating system.
Generate a daily operational briefing for the operator.

Return ONLY valid JSON — no markdown fences, no extra keys — matching this exact structure:
{
  "summary": "<2-3 sentence situational overview>",
  "priorities": [
    {"label": "<short action phrase>", "detail": "<one sentence explanation>"},
    {"label": "<short action phrase>", "detail": "<one sentence explanation>"},
    {"label": "<short action phrase>", "detail": "<one sentence explanation>"}
  ],
  "risks": [
    "<risk statement>",
    "<risk statement>"
  ],
  "recommendation": "<2-3 sentence tactical recommendation for today>"
}

Tone: professional, direct, operational. Focus on execution, goals, and forward momentum."""

_PLAN_SYSTEM = """\
You are HELIOS, an elite AI planning engine.
Generate a structured execution plan based on the operator's objective.

Return ONLY valid JSON — no markdown fences, no extra keys — matching this exact structure:
{
  "plan_title": "<concise plan title>",
  "summary": "<3-4 sentence plan overview>",
  "steps": [
    {
      "step_number": 1,
      "title": "<phase name>",
      "description": "<2-3 sentences describing what to do in this phase>",
      "day_target": <day number when phase completes, integer>
    }
  ],
  "estimated_timeline": "<e.g. '30 days'>",
  "risks": ["<risk>", "<risk>", "<risk>"],
  "recommendation": "<2-3 sentence recommendation for execution>"
}

Constraints:
- Generate 4-7 sequential phases appropriate for the planning horizon
- step_number values are 1-indexed and sequential
- day_target values must be strictly ascending integers
- The final step's day_target must equal the total horizon days
- Tone: professional, operational, action-oriented"""

_CHAT_SYSTEM = """\
You are HELIOS, an elite AI life-operating system assistant.
Answer the operator's question with precision and actionable insight.

Return ONLY valid JSON — no markdown fences, no extra keys — matching this exact structure:
{
  "reply": "<your response — be direct, specific, and operational>",
  "suggested_actions": [
    "<concrete action the operator should take>",
    "<concrete action the operator should take>"
  ],
  "follow_up_questions": [
    "<natural follow-up question>",
    "<natural follow-up question>",
    "<natural follow-up question>"
  ],
  "recommended_actions": [
    {
      "id": "<unique id, e.g. rec-1>",
      "type": "<create_task|update_task_status|create_goal|prioritize_tasks|generate_plan>",
      "title": "<short action title>",
      "description": "<one sentence describing what this action will do>",
      "confidence": <float 0.0-1.0>,
      "payload_preview": {"<key>": "<value>"}
    }
  ]
}

Constraints:
- reply: 2-5 sentences, professional and direct
- suggested_actions: 2-3 items, specific and immediately actionable
- follow_up_questions: exactly 3 items, phrased as the operator asking you
- recommended_actions: 0-3 items. Only include actions that are genuinely relevant to the operator's message. Use type values exactly as listed. confidence is 0.0-1.0 (how certain you are this action is beneficial). payload_preview is a concise human-readable dict of what would happen. Omit if no actions are clearly warranted.
- Tone: professional, concise, operational. No filler language."""


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

    def generate_briefing(self, user_name: str) -> DailyBriefing:
        try:
            data = self._call(
                system=_BRIEFING_SYSTEM,
                user=f"Generate a daily briefing for operator: {user_name}",
            )
            return DailyBriefing(
                summary=data["summary"],
                priorities=[BriefingPriority(**p) for p in data["priorities"]],
                risks=data["risks"],
                recommendation=data["recommendation"],
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
        goal_line = f"Linked goal: {goal_title}" if goal_title else ""
        user_msg = (
            f"Operator: {user_name}\n"
            f"Objective: {prompt}\n"
            f"Planning horizon: {horizon} days\n"
            f"{goal_line}"
        ).strip()

        try:
            data = self._call(system=_PLAN_SYSTEM, user=user_msg)
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
        # Build the system prompt — append user context block when provided so
        # the model can give specific, grounded advice based on real user data.
        system = _CHAT_SYSTEM
        if user_context:
            system = (
                system
                + f"\n\nOPERATOR'S CURRENT STATE (live data — use this to give specific, "
                f"personalised advice):\n{user_context}"
            )

        context_line = f"Context domain: {context_type}" if context_type else ""
        user_msg = (
            f"Operator: {user_name}\n"
            f"{context_line}\n"
            f"Message: {message}"
        ).strip()

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
