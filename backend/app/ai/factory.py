from app.ai.base import AIProvider


def get_ai_provider() -> AIProvider:
    from app.config import settings

    provider = settings.ai_provider.lower()

    if provider == "mock":
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider()

    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError(
                "AI_PROVIDER=openai requires OPENAI_API_KEY to be set in the environment."
            )
        from app.ai.openai_provider import OpenAIProvider
        return OpenAIProvider(api_key=settings.openai_api_key)

    raise RuntimeError(
        f"Unknown AI_PROVIDER '{settings.ai_provider}'. Supported values: mock, openai"
    )
