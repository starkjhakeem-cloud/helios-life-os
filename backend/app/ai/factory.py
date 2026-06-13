import logging

from app.ai.base import AIProvider

logger = logging.getLogger(__name__)


def get_ai_provider() -> AIProvider:
    from app.config import settings

    provider = settings.ai_provider.lower()

    if provider == "mock":
        from app.ai.mock_provider import MockAIProvider
        return MockAIProvider()

    if provider == "openai":
        if not settings.openai_api_key:
            logger.warning(
                "AI_PROVIDER=openai but OPENAI_API_KEY is not set — "
                "falling back to mock provider. Set OPENAI_API_KEY in .env to enable real AI."
            )
            from app.ai.mock_provider import MockAIProvider
            return MockAIProvider()
        from app.ai.openai_provider import OpenAIProvider
        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)

    if provider == "anthropic":
        if not settings.anthropic_api_key:
            logger.warning(
                "AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set — "
                "falling back to mock provider. Set ANTHROPIC_API_KEY in .env to enable Claude."
            )
            from app.ai.mock_provider import MockAIProvider
            return MockAIProvider()
        from app.ai.anthropic_provider import AnthropicProvider
        return AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.anthropic_model)

    logger.warning(
        f"Unknown AI_PROVIDER '{settings.ai_provider}' — falling back to mock. "
        "Supported values: mock, openai, anthropic"
    )
    from app.ai.mock_provider import MockAIProvider
    return MockAIProvider()
