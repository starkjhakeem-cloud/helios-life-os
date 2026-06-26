from app.ai.manager import AIProviderManager
from app.ai.mock_provider import MockAIProvider
from app.ai.types import AIErrorCode, HeliosAIError


class UnavailableProvider(MockAIProvider):
    provider_name = "openai"
    model = "test-openai"

    def generate_text(self, *args, **kwargs):
        raise HeliosAIError(
            AIErrorCode.NETWORK_ERROR,
            "OpenAI test provider unavailable.",
            provider=self.provider_name,
        )


class SecretLeakingProvider(MockAIProvider):
    provider_name = "openai"
    model = "test-openai"

    def generate_text(self, *args, **kwargs):
        raise RuntimeError("raw provider failure with secret-token")


def test_provider_order_starts_with_active_provider():
    manager = AIProviderManager(
        active_provider="openai",
        fallback_order=["mock", "anthropic", "openai"],
    )

    assert manager._provider_order() == ["openai", "mock", "anthropic"]


def test_missing_openai_api_key_falls_back_to_mock():
    manager = AIProviderManager(
        active_provider="openai",
        fallback_order=["mock"],
        openai_api_key=None,
    )

    response = manager.generate_text("hello")

    assert response.provider == "mock"
    assert response.model == "mock"
    assert response.content.startswith("Mock response")


def test_openai_unavailable_falls_back_to_mock(monkeypatch):
    manager = AIProviderManager(
        active_provider="openai",
        fallback_order=["mock"],
        openai_api_key="test-key",
        max_retries=0,
    )

    def build_provider(provider_name: str):
        if provider_name == "openai":
            return UnavailableProvider()
        return MockAIProvider()

    monkeypatch.setattr(manager, "_build_provider", build_provider)

    response = manager.generate_text("fallback please")

    assert response.provider == "mock"
    assert response.content.startswith("Mock response")
    assert manager.health_snapshot()["openai"].healthy is False
    assert manager.health_snapshot()["mock"].healthy is True


def test_normalized_response_shape_from_manager():
    manager = AIProviderManager(active_provider="mock", fallback_order=[])

    response = manager.generate_text("shape check").to_dict()

    assert set(response) == {
        "provider",
        "model",
        "content",
        "usage",
        "finish_reason",
        "latency_ms",
        "timestamp",
    }
    assert response["provider"] == "mock"
    assert isinstance(response["latency_ms"], int)


def test_normalized_error_shape_when_all_providers_fail():
    manager = AIProviderManager(
        active_provider="openai",
        fallback_order=[],
        openai_api_key=None,
    )

    try:
        manager.generate_text("fail")
    except HeliosAIError as exc:
        detail = exc.public_detail()
    else:
        raise AssertionError("Expected HeliosAIError")

    assert detail["error"] == "helios_ai_unavailable"
    assert detail["code"] == "provider_offline"
    assert "OPENAI_API_KEY" not in detail["message"]


def test_raw_provider_error_does_not_leak(monkeypatch):
    manager = AIProviderManager(
        active_provider="openai",
        fallback_order=[],
        openai_api_key="test-key",
        max_retries=0,
    )

    monkeypatch.setattr(manager, "_build_provider", lambda _name: SecretLeakingProvider())

    try:
        manager.generate_text("hide raw error")
    except HeliosAIError as exc:
        detail = exc.public_detail()
    else:
        raise AssertionError("Expected HeliosAIError")

    assert "secret-token" not in str(detail)
    assert "raw provider failure" not in str(detail)
