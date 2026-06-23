from app.ai.mock_provider import MockAIProvider, _detect_intent
from app.ai.name_formatting import enforce_name_formatting, preserve_display_name
from app.ai.prompts import BRIEFING_SYSTEM, CHAT_SYSTEM, ORCHESTRATION_SYSTEM, PLAN_SYSTEM


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


def test_display_name_does_not_receive_automatic_punctuation():
    assert (
        preserve_display_name(
            "Good evening\nForgePoint Enterprises. Your briefing is ready.",
            "ForgePoint Enterprises",
        )
        == "Good evening\nForgePoint Enterprises Your briefing is ready."
    )


def test_intentional_name_punctuation_is_preserved_without_duplication():
    assert (
        preserve_display_name(
            "Good evening\nForgePoint Enterprises.. Your briefing is ready.",
            "ForgePoint Enterprises.",
        )
        == "Good evening\nForgePoint Enterprises. Your briefing is ready."
    )


def test_name_formatting_is_applied_recursively():
    value = {
        "greeting": "Hello, ForgePoint Enterprises.",
        "items": ["ForgePoint Enterprises — daily plan"],
    }
    assert enforce_name_formatting(value, "ForgePoint Enterprises") == {
        "greeting": "Hello, ForgePoint Enterprises",
        "items": ["ForgePoint Enterprises daily plan"],
    }


def test_all_ai_system_prompts_include_global_name_rule():
    for prompt in (BRIEFING_SYSTEM, PLAN_SYSTEM, CHAT_SYSTEM, ORCHESTRATION_SYSTEM):
        assert "Render every operator display name and organization name exactly as supplied" in prompt


def test_mock_briefing_renders_stored_name_on_unpunctuated_line():
    briefing = MockAIProvider().generate_briefing("ForgePoint Enterprises")
    assert "ForgePoint Enterprises\n" in briefing.greeting
    assert "ForgePoint Enterprises." not in briefing.greeting
