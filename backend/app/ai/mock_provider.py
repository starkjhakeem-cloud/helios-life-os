import uuid
from datetime import date, datetime, timedelta, timezone

from app.ai.base import AIProvider
from app.schemas.ai import BriefingPriority, ChatResponse, DailyBriefing, PlanResponse, PlanStep, RecommendedAction
from app.schemas.autonomy import SuggestionItem
from app.schemas.orchestration import AgentAssessment, OrchestrationResponse

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
        "recommended_actions": [
            {
                "type": "generate_plan",
                "title": "Generate Today's Execution Plan",
                "description": "Create a focused 7-day sprint plan for your highest-priority active goal.",
                "confidence": 0.75,
                "payload_preview": {"horizon_days": 7, "prompt": "Advance highest-priority goal"},
            },
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
        "recommended_actions": [
            {
                "type": "create_goal",
                "title": "Define a New Strategic Goal",
                "description": "Add a new goal with a clear title and 30-day target date to expand your execution portfolio.",
                "confidence": 0.70,
                "payload_preview": {"suggested_title": "New Strategic Objective", "target_date": "+30 days", "status": "active"},
                "execution_payload": {"title": "New Strategic Objective", "status": "active"},
            },
            {
                "type": "generate_plan",
                "title": "Generate Goal Execution Plan",
                "description": "Create a phased 30-day execution plan linked to your highest-priority active goal.",
                "confidence": 0.88,
                "payload_preview": {"horizon_days": 30, "prompt": "Execute highest-priority active goal"},
            },
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
        "recommended_actions": [
            {
                "type": "prioritize_tasks",
                "title": "Reprioritize Open Task Stack",
                "description": "Reorder your open tasks by impact and urgency to maximise daily output.",
                "confidence": 0.82,
                "payload_preview": {"filter": "open", "sort_by": "priority_desc"},
            },
            {
                "type": "create_task",
                "title": "Add a High-Priority Task",
                "description": "Create a new high-priority task linked to your most active goal.",
                "confidence": 0.65,
                "payload_preview": {"priority": "high", "status": "todo", "suggested_title": "Next critical action"},
                "execution_payload": {"title": "Next critical action", "priority": "high", "status": "todo"},
            },
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
        "recommended_actions": [
            {
                "type": "generate_plan",
                "title": "Launch 30-Day Execution Plan",
                "description": "Generate a structured phased plan for your next major objective with clear milestones.",
                "confidence": 0.90,
                "payload_preview": {"horizon_days": 30, "prompt": "Next major objective"},
            },
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
        "recommended_actions": [
            {
                "type": "prioritize_tasks",
                "title": "Reprioritize by Completion Rate",
                "description": "Reorder your task stack to focus on items trending toward completion.",
                "confidence": 0.72,
                "payload_preview": {"sort_by": "completion_velocity", "filter": "open"},
            },
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
        "recommended_actions": [
            {
                "type": "generate_plan",
                "title": "Generate AI Execution Plan",
                "description": "Use the AI Planner to create a structured 14-day sprint for your top active goal.",
                "confidence": 0.85,
                "payload_preview": {"horizon_days": 14, "prompt": "Top active goal execution sprint"},
            },
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
        "recommended_actions": [
            {
                "type": "create_task",
                "title": "Create Your First Action Item",
                "description": "Add a high-priority task linked to an active goal to start building execution momentum.",
                "confidence": 0.80,
                "payload_preview": {"priority": "high", "status": "todo", "suggested_title": "First action item"},
                "execution_payload": {"title": "First action item", "priority": "high", "status": "todo"},
            },
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
        "recommended_actions": [
            {
                "type": "prioritize_tasks",
                "title": "Review and Reprioritize Tasks",
                "description": "Surface your most impactful open tasks and set clear daily priorities.",
                "confidence": 0.68,
                "payload_preview": {"filter": "open", "sort_by": "priority_desc"},
            },
        ],
    },
}


# ── Provider ──────────────────────────────────────────────────────────────────

class MockAIProvider(AIProvider):
    def generate_briefing(self, user_name: str, user_context: str | None = None) -> DailyBriefing:
        hour = datetime.now(timezone.utc).hour
        if hour < 12:
            time_word = "Good morning"
        elif hour < 17:
            time_word = "Good afternoon"
        else:
            time_word = "Good evening"

        # Populate email fields only when the context builder surfaced email data.
        has_emails = bool(user_context and "UNREAD MESSAGES" in user_context)

        return DailyBriefing(
            greeting=f"{time_word}, {user_name}. Your priority queue is loaded and systems are nominal.",
            summary=(
                f"Operator {user_name}, all systems nominal. Goal and task tracking is active, "
                "analytics pipeline is live, and the AI planning engine is ready for deployment. "
                "Focus on closing open tasks and advancing your highest-priority goals today."
            ),
            priorities=[
                BriefingPriority(
                    label="Close high-priority tasks",
                    detail="Review your task list and resolve any critical or high-priority items before accepting new work.",
                ),
                BriefingPriority(
                    label="Advance active goals",
                    detail="Each active goal should have at least one in-progress task attached — gaps signal planning debt.",
                ),
                BriefingPriority(
                    label="Generate an AI execution plan",
                    detail="Use the AI Planner to produce a structured sprint for your next major objective.",
                ),
            ],
            risks=[
                "Overdue tasks accumulate silently — check the Analytics tab to surface any that have slipped.",
                "Goals without linked tasks have no execution path — ensure each goal has at least one active task.",
            ],
            focus_block=(
                "Allocate the first 90 minutes to your highest-priority in-progress task — remove all "
                "notifications, close non-essential tabs, and target a concrete deliverable you can mark done "
                "by end of block. Then do a 10-minute review of your open task stack before context-switching."
            ),
            recommended_agent="Strategy Agent",
            email_summary=(
                "Your inbox has unread messages that may require attention before end of day. "
                "High-priority items are flagged below."
                if has_emails else None
            ),
            important_emails=(
                ["Review unread high-priority messages in the Email tab (from: multiple senders)"]
                if has_emails else []
            ),
            email_risks=(
                ["Unread messages may contain time-sensitive requests — inbox review is overdue"]
                if has_emails else []
            ),
            suggested_email_actions=(
                ["Open the Email tab, filter by IMPORTANT, and action urgent messages before noon"]
                if has_emails else []
            ),
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    def generate_plan(
        self,
        prompt: str,
        horizon: int,
        goal_title: str | None,
        user_name: str,
        user_context: str | None = None,
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

    def orchestrate_agents(
        self,
        objective: str,
        agents: list[dict],
        user_context: str | None,
        user_name: str,
    ) -> OrchestrationResponse:
        _DOMAIN_ACTIONS: dict[str, list[str]] = {
            "strategy": [
                "Map the objective against your active goals and flag misalignments",
                "Break the objective into quarterly milestones with measurable checkpoints",
                "Identify the single highest-leverage first action to take within 7 days",
            ],
            "finance": [
                "Estimate the resource investment required and check against current budget headroom",
                "Define a financial success metric and set a spend threshold before committing",
                "Identify financial risks and surface any runway concerns tied to this objective",
            ],
            "study": [
                "Identify the skill gaps relevant to this objective and source learning materials",
                "Schedule dedicated study blocks in the next 14 days to address knowledge gaps",
                "Summarise existing knowledge that directly supports this objective",
            ],
            "health": [
                "Assess whether current energy and recovery levels support the effort required",
                "Schedule recovery protocols to prevent burnout during the execution window",
                "Flag lifestyle adjustments needed to sustain focus over the objective timeline",
            ],
            "career": [
                "Evaluate how this objective advances or detracts from your declared career trajectory",
                "Identify network contacts or mentors who can accelerate progress on this objective",
                "Align the objective with your 6–18 month career roadmap",
            ],
        }

        assessments = [
            AgentAssessment(
                agent_id=a["id"],
                agent_name=a["name"],
                role=a["role"],
                perspective=(
                    f"From a {a['role'].lower()} perspective, this objective requires "
                    "domain-specific analysis and structured execution to deliver measurable results."
                ),
                key_actions=_DOMAIN_ACTIONS.get(a["id"], [
                    f"Assess the objective from the {a['role'].lower()} domain",
                    f"Identify {a['role'].lower()} risks and surface blockers",
                ])[:3],
                confidence=0.78,
            )
            for a in agents
        ]

        short_title = objective[:50].rstrip()

        return OrchestrationResponse(
            objective=objective,
            participating_agents=[a["name"] for a in agents],
            agent_assessments=assessments,
            coordinated_plan=(
                "A coordinated multi-agent approach is recommended for this objective. "
                "Begin with strategic alignment to ensure it maps to your active goals, "
                "then assess resource and skill requirements before committing to a timeline. "
                "Schedule weekly cross-domain reviews to keep all agents synchronized. "
                "[Context mode active — enable the OpenAI provider for data-driven orchestration.]"
            ),
            risks=[
                "Scope creep — without clear boundaries, multi-domain objectives can expand beyond manageable size",
                "Resource conflict — multiple domains may compete for the same time and energy allocation",
                "Misaligned priorities — verify this objective does not crowd out higher-priority active goals",
            ],
            recommended_next_actions=[
                "Review the coordinated plan above and confirm the objective is correctly scoped",
                "Open the AI Planner to generate a detailed execution plan for the primary phase",
                "Check your Goals and Tasks tabs to ensure this objective has at least one active task",
                "Schedule a review checkpoint in 7 days to assess early progress across all domains",
            ],
            actionable_recommendations=[
                RecommendedAction(
                    id=f"orch-{uuid.uuid4().hex[:8]}",
                    type="create_task",
                    title="Create First Milestone Task",
                    description=f"Add a high-priority task to start execution of: {short_title}",
                    confidence=0.82,
                    payload_preview={
                        "title":    f"Begin: {short_title}",
                        "priority": "high",
                        "status":   "todo",
                    },
                    execution_payload={
                        "title":    f"Begin: {short_title}",
                        "priority": "high",
                        "status":   "todo",
                    },
                ),
                RecommendedAction(
                    id=f"orch-{uuid.uuid4().hex[:8]}",
                    type="generate_plan",
                    title="Generate Execution Plan",
                    description="Open the AI Planner to create a phased execution plan for this objective.",
                    confidence=0.90,
                    payload_preview={"action": "Navigate to Agents tab → AI Planner"},
                    execution_payload=None,
                ),
            ],
            context_scope="mock",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    def generate_chat_reply(
        self,
        message: str,
        user_name: str,
        context_type: str | None,
        user_context: str | None = None,
    ) -> ChatResponse:
        intent = _detect_intent(message)
        data = _RESPONSES[intent]
        reply = data["reply"]

        if user_context and "No active goals" not in user_context:
            # Mock cannot reason over the context data, but it acknowledges
            # that context mode is active. The OpenAI provider fully utilises it.
            reply = (
                reply
                + "\n\n[Context mode active — your live goals and tasks were included. "
                "Enable the OpenAI provider for data-driven, personalised responses.]"
            )

        # Assign fresh UUIDs so dismissal on the frontend is per-message, not global.
        recommended_actions = [
            RecommendedAction(id=str(uuid.uuid4()), **raw)
            for raw in data.get("recommended_actions", [])
        ]

        return ChatResponse(
            reply=reply,
            suggested_actions=data["suggested_actions"],
            follow_up_questions=data["follow_up_questions"],
            recommended_actions=recommended_actions,
            provider="mock",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

    def generate_suggestions(
        self,
        user_name: str,
        user_context: str | None = None,
    ) -> list[SuggestionItem]:
        now = datetime.now(timezone.utc).isoformat()
        has_goals    = bool(user_context and "GOALS"           in user_context)
        has_tasks    = bool(user_context and "TASKS"           in user_context)
        has_calendar = bool(user_context and "CALENDAR"        in user_context)
        has_emails   = bool(user_context and "UNREAD MESSAGES" in user_context)
        has_memories = bool(user_context and "LONG-TERM MEMORY" in user_context)

        target_30 = (date.today() + timedelta(days=30)).isoformat()
        target_7  = (date.today() + timedelta(days=7)).isoformat()

        suggestions: list[SuggestionItem] = []

        # ── Strategy agent: always suggest a daily execution plan ────────────
        suggestions.append(SuggestionItem(
            id=str(uuid.uuid4()),
            title="Generate today's execution plan",
            description=(
                f"Build a structured 7-day plan for {user_name} based on active goals, "
                "current tasks, and available focus time."
            ),
            source_agent="strategy_agent",
            suggested_action_type="generate_plan",
            risk_level="low",
            reason=(
                "Daily planning converts ambition into execution. "
                "A structured plan prevents priority drift and surfaces blockers early."
            ),
            payload_preview={
                "prompt": "Generate a focused execution plan for today and the next 7 days",
                "planning_horizon_days": 7,
            },
            created_at=now,
        ))

        # ── Strategy agent: 30-day goal execution plan ────────────────────────
        if has_goals:
            suggestions.append(SuggestionItem(
                id=str(uuid.uuid4()),
                title="Create 30-day plan for active goal",
                description=(
                    "Generate a phased execution plan linked to your highest-priority active goal."
                ),
                source_agent="strategy_agent",
                suggested_action_type="generate_plan",
                risk_level="low",
                reason=(
                    "Active goals without execution plans are at risk of stalling. "
                    "A 30-day horizon provides enough structure without over-committing."
                ),
                payload_preview={
                    "prompt": "Advance highest-priority active goal with a phased plan",
                    "planning_horizon_days": 30,
                },
                created_at=now,
            ))

        # ── Task manager: create a weekly review task ─────────────────────────
        if has_tasks:
            suggestions.append(SuggestionItem(
                id=str(uuid.uuid4()),
                title="Schedule weekly progress review",
                description=(
                    "Create a recurring checkpoint task to review goal and task status each week."
                ),
                source_agent="task_manager",
                suggested_action_type="create_task",
                risk_level="low",
                reason=(
                    "Task lists without regular reviews accumulate stale items. "
                    "A weekly checkpoint keeps the backlog accurate and priorities fresh."
                ),
                payload_preview={
                    "title": "Weekly progress review",
                    "priority": "medium",
                    "status": "todo",
                    "due_date": target_7,
                },
                created_at=now,
            ))

        # ── Email intelligence: create task from inbox ────────────────────────
        if has_emails:
            suggestions.append(SuggestionItem(
                id=str(uuid.uuid4()),
                title="Create task from high-priority email",
                description=(
                    "Convert an unread high-priority email into a tracked action item."
                ),
                source_agent="email_intelligence",
                suggested_action_type="create_task",
                risk_level="low",
                reason=(
                    "Unread important emails often contain hidden action items. "
                    "Capturing them as tasks prevents follow-up slip."
                ),
                payload_preview={
                    "title": "Action item from high-priority inbox",
                    "priority": "high",
                    "status": "todo",
                },
                created_at=now,
            ))

        # ── Calendar intelligence: schedule a focus block task ────────────────
        if has_calendar:
            suggestions.append(SuggestionItem(
                id=str(uuid.uuid4()),
                title="Block deep-work time for top task",
                description=(
                    "Create a focus-block task for your highest-priority in-progress item."
                ),
                source_agent="calendar_intelligence",
                suggested_action_type="create_task",
                risk_level="low",
                reason=(
                    "Calendar context shows available windows — anchoring a focus block "
                    "as a task prevents context-switching and protects execution time."
                ),
                payload_preview={
                    "title": "Deep-work focus block: highest-priority task",
                    "priority": "high",
                    "status": "todo",
                    "due_date": target_7,
                },
                created_at=now,
            ))

        # ── Strategy agent: define next goal (when no other extras filled slots) ─
        if not has_emails and not has_calendar:
            suggestions.append(SuggestionItem(
                id=str(uuid.uuid4()),
                title="Define your next strategic goal",
                description=(
                    "Create a new goal with a clear outcome statement and a 30-day target date."
                ),
                source_agent="strategy_agent",
                suggested_action_type="create_goal",
                risk_level="low",
                reason=(
                    "Operators without a defined next objective lose strategic momentum. "
                    "Setting a goal now keeps the execution stack healthy."
                ),
                payload_preview={
                    "title": "Next strategic objective",
                    "description": "Define the outcome, success criteria, and key milestones.",
                    "status": "active",
                    "target_date": target_30,
                },
                created_at=now,
            ))

        # ── Memory agent: create a reflection task (when memories exist) ─────
        if has_memories:
            suggestions.append(SuggestionItem(
                id=str(uuid.uuid4()),
                title="Review and update long-term memory",
                description=(
                    "Create a task to review stored preferences and goals context "
                    "and update any entries that no longer reflect your current state."
                ),
                source_agent="strategy_agent",
                suggested_action_type="create_task",
                risk_level="low",
                reason=(
                    "Long-term memory entries become stale without periodic review. "
                    "Keeping them current improves AI personalisation quality."
                ),
                payload_preview={
                    "title": "Review and refresh long-term memory entries",
                    "priority": "low",
                    "status": "todo",
                },
                created_at=now,
            ))

        return suggestions[:5]
