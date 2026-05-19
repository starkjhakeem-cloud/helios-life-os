from app.ai.base import AIProvider
from app.schemas.ai import DailyBriefing, PlanResponse


class OpenAIProvider(AIProvider):
    """
    OpenAI-backed provider. Activated when AI_PROVIDER=openai and OPENAI_API_KEY is set.
    Requires: pip install openai
    """

    def __init__(self, api_key: str) -> None:
        try:
            import openai  # noqa: F401
        except ImportError as e:
            raise RuntimeError(
                "openai package is required for OpenAI provider. "
                "Install it: pip install openai"
            ) from e
        self._api_key = api_key

    def generate_briefing(self, user_name: str) -> DailyBriefing:
        raise NotImplementedError(
            "OpenAI briefing generation is not yet implemented. "
            "Set AI_PROVIDER=mock or implement this method."
        )

    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
    ) -> PlanResponse:
        raise NotImplementedError(
            "OpenAI plan generation is not yet implemented. "
            "Set AI_PROVIDER=mock or implement this method."
        )
