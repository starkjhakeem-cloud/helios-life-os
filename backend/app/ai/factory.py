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
        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set in the environment."
            )
        from app.ai.anthropic_provider import AnthropicProvider
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.anthropic_model)

    raise RuntimeError(
        f"Unknown AI_PROVIDER '{settings.ai_provider}'. Supported values: mock, openai, anthropic"
    )
