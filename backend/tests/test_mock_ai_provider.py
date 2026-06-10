from app.ai.mock_provider import MockAIProvider, _detect_intent


def test_detect_intent_returns_goals_intent():
    assert _detect_intent("How are my goals doing today?") == "goals"


def test_generate_chat_reply_includes_mock_provider_metadata():
    provider = MockAIProvider()
    response = provider.generate_chat_reply(
        "Tell me about my goals",
        user_name="Taylor",
        context_type=None,
        user_context="You have one active goal.",
    )

    assert response.provider == "mock"
    assert "Context mode active" in response.reply
    assert len(response.suggested_actions) > 0
    assert len(response.recommended_actions) > 0


def test_generate_plan_returns_valid_plan_for_14_days():
    provider = MockAIProvider()
    plan = provider.generate_plan(
        prompt="Launch a new habit",
        horizon=14,
        goal_title="Build a daily routine",
        user_name="Taylor",
    )

    assert plan.plan_title.startswith("Execution Plan:")
    assert plan.estimated_timeline == "14 days"
    assert len(plan.steps) >= 4
    assert all(step.step_number > 0 for step in plan.steps)
