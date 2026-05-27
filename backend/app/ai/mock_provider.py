from datetime import datetime, timezone

from app.ai.base import AIProvider
from app.schemas.ai import BriefingPriority, ChatResponse, DailyBriefing, PlanResponse, PlanStep

# ── Intent detection ──────────────────────────────────────────────────────────

def _detect_intent(message: str) -> str:
    lower = message.lower()
    if any(w in lower for w in ["hello", " hi ", "hey", "morning", "evening", "afternoon", "greet"]) or lower.strip() in {"hi", "hello", "hey"}:
        return "greeting"
    if any(w in lower for w in ["goal", "objective", "target", "milestone", "achieve", "aspire"]):
        return "goals"
    if any(w in lower for w in ["task", "todo", "to-do", "action item", "checklist", "doing", "working on"]):
        return "tasks"
    if any(w in lower for w in ["plan", "planning", "schedule", "roadmap", "strategy", "sprint", "timeline"]):
        return "planning"
    if any(w in lower for w in ["analytic", "progress", "metric", "stat", "performance", "trend", "data", "report"]):
        return "analytics"
    if any(w in lower for w in ["agent", "monitor", "intelligence", "system status", "helios"]):
        return "agents"
    if any(w in lower for w in ["help", "what can you", "capabilities", "feature", "how do you", "what do you"]):
        return "help"
    return "general"


# ── Canned responses keyed by intent ─────────────────────────────────────────

_RESPONSES: dict[str, dict] = {
    "greeting": {
        "reply": (
            "Operator online. All HELIOS systems are active and monitoring your life stack. "
            "I can assist with goal strategy, task prioritization, execution planning, and analytics interpretation. "
            "What would you like to work on?"
        ),
        "suggested_actions": [
            "Open the Home tab to review today's dashboard",
            "Visit Analytics for a system-wide performance snapshot",
        ],
        "follow_up_questions": [
            "What should I focus on today?",
            "How is my progress this week?",
            "Help me plan my next goal.",
        ],
    },
    "goals": {
        "reply": (
            "Goal architecture is the foundation of the HELIOS execution stack. "
            "Each active goal should have at least one in-progress task linked to it — goals without tasks have no execution path. "
            "Review your Goals tab to check for stalled objectives and consider generating an AI execution plan for your highest-priority goal."
        ),
        "suggested_actions": [
            "Open the Goals tab to review active objectives",
            "Use the AI Planner (Agents tab) to generate a goal execution plan",
            "Link tasks to each active goal to ensure execution coverage",
        ],
        "follow_up_questions": [
            "How do I structure a 30-day goal plan?",
            "What makes a goal achievable vs aspirational?",
            "Help me break down a goal into actionable tasks.",
        ],
    },
    "tasks": {
        "reply": (
            "Task velocity determines your daily execution rate. "
            "Prioritize by impact: close critical and high-priority tasks before accepting new work. "
            "If tasks are accumulating without progress, that's a signal to review your capacity and defer or delete low-value items. "
            "Check the Tasks tab to surface anything overdue."
        ),
        "suggested_actions": [
            "Open the Tasks tab and filter by high priority",
            "Mark any stalled tasks as blocked or defer them",
            "Check Analytics to see your task completion trend",
        ],
        "follow_up_questions": [
            "How should I prioritize tasks across multiple goals?",
            "What's the best way to avoid task overload?",
            "How do I know which tasks to defer vs delete?",
        ],
    },
    "planning": {
        "reply": (
            "Structured planning converts ambition into execution. "
            "Use the AI Planner in the Agents tab to generate a phased execution plan for any objective — "
            "enter your goal, select a planning horizon (7–90 days), and receive a step-by-step breakdown. "
            "Plans should be reviewed at the midpoint and adjusted as context shifts."
        ),
        "suggested_actions": [
            "Open the Agents tab and use the AI Planner",
            "Select a 14–30 day horizon for focused sprints",
            "Link the plan to an active goal for full traceability",
        ],
        "follow_up_questions": [
            "What planning horizon should I use for a new project?",
            "How do I turn a plan into daily actions?",
            "What's the difference between a goal and a plan?",
        ],
    },
    "analytics": {
        "reply": (
            "Analytics provide the signal layer for your operating system. "
            "Key metrics to monitor: task completion rate, goal advancement velocity, and overdue task accumulation. "
            "A strong week shows high completion rates with no stalled goals. "
            "Open the Analytics tab for a full breakdown of your current performance indices."
        ),
        "suggested_actions": [
            "Open the Analytics tab for live performance data",
            "Review the completion rate trend over the past 30 days",
            "Identify goals with no recent task completions — these signal planning gaps",
        ],
        "follow_up_questions": [
            "What analytics metrics matter most?",
            "How do I improve my task completion rate?",
            "What does a healthy HELIOS performance profile look like?",
        ],
    },
    "agents": {
        "reply": (
            "HELIOS operates five specialized intelligence agents: Goal Tracker, Task Manager, "
            "Analytics Engine, AI Planner, and System Monitor. "
            "Each agent runs continuously, surfacing insights and risks within its domain. "
            "Visit the Agents tab to see real-time agent status and use the AI Planner to generate execution strategies."
        ),
        "suggested_actions": [
            "Open the Agents tab to view all five agent statuses",
            "Use the AI Planner agent to generate a structured execution plan",
            "Check the Home tab for the AI-generated daily briefing",
        ],
        "follow_up_questions": [
            "What does each HELIOS agent do?",
            "How do I use the AI Planner?",
            "Can agents take actions autonomously?",
        ],
    },
    "help": {
        "reply": (
            "I am HELIOS — your AI life-operating system. Here is what I can assist with:\n\n"
            "• Goal strategy — structure objectives, track progress, identify gaps\n"
            "• Task prioritization — surface critical work, manage load\n"
            "• Execution planning — AI-generated phased plans for any objective\n"
            "• Analytics interpretation — understand your performance data\n"
            "• System status — agent health, operational readiness\n\n"
            "Ask me anything across these domains."
        ),
        "suggested_actions": [
            "Review the Home dashboard for today's operational briefing",
            "Visit Agents to access the AI Planner",
            "Open Analytics for a performance snapshot",
        ],
        "follow_up_questions": [
            "How do I plan a new goal?",
            "What should I work on today?",
            "How is my productivity trending?",
        ],
    },
    "general": {
        "reply": (
            "Acknowledged. I am processing your query through the HELIOS intelligence layer. "
            "For the most precise guidance, try framing your question around a specific domain: "
            "goals, tasks, planning, analytics, or system status. "
            "I perform best with direct, operational questions."
        ),
        "suggested_actions": [
            "Check the Home tab for your daily intelligence briefing",
            "Review the Goals and Tasks tabs for pending items",
        ],
        "follow_up_questions": [
            "What should I focus on today?",
            "How do I plan my next 30 days?",
            "Show me my analytics summary.",
        ],
    },
}


# ── Provider ──────────────────────────────────────────────────────────────────

class MockAIProvider(AIProvider):
    def generate_briefing(self, user_name: str) -> DailyBriefing:
        return DailyBriefing(
            summary=(
                f"Operator {user_name}, all systems nominal. Goal and task tracking is active, "
                "analytics pipeline is live, and the AI planning engine is ready for deployment. "
                "Current productivity index is strong — focus on closing open tasks and advancing "
                "your highest-priority goals today."
            ),
            priorities=[
                BriefingPriority(
                    label="Close high-priority tasks",
                    detail="Review your task list and resolve any critical or high-priority items before new work is added.",
                ),
                BriefingPriority(
                    label="Advance active goals",
                    detail="Each active goal should have at least one in-progress task attached. Gaps signal planning debt.",
                ),
                BriefingPriority(
                    label="Run an AI execution plan",
                    detail="Use the AI Planner to generate a structured sprint for your next major objective.",
                ),
            ],
            risks=[
                "Overdue tasks accumulate silently — check the Analytics tab to surface any that have slipped.",
                "Goals without linked tasks have no execution path — ensure each goal has at least one active task.",
            ],
            recommendation=(
                "Start with a 10-minute review of your Analytics summary to understand where momentum is strongest. "
                "Then open the AI Planner, enter your top goal as a prompt, and generate a focused execution plan "
                "for the next 14–30 days. Consistent daily input compounds rapidly."
            ),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
    ) -> PlanResponse:
        context = goal_title or prompt[:60]

        if horizon <= 7:
            phases = [
                ("Foundation",  max(1, horizon // 3)),
                ("Execution",   max(2, (horizon * 2) // 3)),
                ("Completion",  horizon),
            ]
        elif horizon <= 14:
            phases = [
                ("Discovery",   max(1, horizon // 4)),
                ("Foundation",  max(2, horizon // 2)),
                ("Build",       max(3, (horizon * 3) // 4)),
                ("Validate",    horizon),
            ]
        elif horizon <= 30:
            phases = [
                ("Research & Planning", max(1,  horizon // 5)),
                ("Foundation",          max(2, (horizon * 2) // 5)),
                ("Core Build",          max(3, (horizon * 3) // 5)),
                ("Integration",         max(4, (horizon * 4) // 5)),
                ("Review & Ship",       horizon),
            ]
        else:
            phases = [
                ("Scoping & Research",  max(1,  horizon // 7)),
                ("Architecture",        max(2, (horizon * 2) // 7)),
                ("Core Development",    max(3, (horizon * 3) // 7)),
                ("Integration",         max(4, (horizon * 4) // 7)),
                ("Testing",             max(5, (horizon * 5) // 7)),
                ("Refinement",          max(6, (horizon * 6) // 7)),
                ("Launch",              horizon),
            ]

        steps = [
            PlanStep(
                step_number=i + 1,
                title=name,
                description=(
                    f"Complete {name.lower()} activities for '{context}'. "
                    "Define clear success criteria before moving to the next phase "
                    "and surface any blockers early."
                ),
                day_target=day,
            )
            for i, (name, day) in enumerate(phases)
        ]

        return PlanResponse(
            plan_title=f"Execution Plan: {context}",
            summary=(
                f"A structured {horizon}-day plan addressing: {prompt} "
                f"This plan breaks the objective into {len(steps)} sequential phases, "
                "each building on the previous to ensure consistent forward momentum. "
                f"Operator {user_name} — review priorities and adjust before execution."
            ),
            steps=steps,
            estimated_timeline=f"{horizon} days",
            risks=[
                "Scope creep — stay anchored to the original objective as new ideas emerge.",
                "Missed dependencies — validate external blockers before starting each phase.",
                f"Timeline pressure — a {horizon}-day commitment requires daily progress to stay on track.",
            ],
            recommendation=(
                f"Begin immediately with Phase 1. Allocate dedicated focus blocks — "
                f"even 30–45 minutes daily compounds significantly over {horizon} days. "
                "Review this plan at the midpoint and adjust steps if the context has shifted."
            ),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
    ) -> ChatResponse:
        intent = _detect_intent(message)
        data = _RESPONSES[intent]
        return ChatResponse(
            reply=data["reply"],
            suggested_actions=data["suggested_actions"],
            follow_up_questions=data["follow_up_questions"],
            provider="mock",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )
