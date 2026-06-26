from app.ai.base import AIProvider


def get_ai_provider() -> AIProvider:
    from app.ai.manager import AIProviderManager
    from app.config import settings

    return AIProviderManager.from_settings(settings)
