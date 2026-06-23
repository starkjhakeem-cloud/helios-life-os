import uuid
from datetime import date, datetime, timedelta, timezone

from app.ai.base import AIProvider
from app.schemas.ai import BriefingPriority, ChatResponse, DailyBriefing, PlanResponse, PlanStep, RecommendedAction
from app.schemas.autonomy import DailyPlan, FocusBlock, PriorityTask, SuggestionItem
from app.schemas.orchestration import AgentAssessment, OrchestrationResponse

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
            greeting=(
                f"{time_word}\n"
                f"{user_name}\n"
                "Your priority queue is loaded and systems are nominal."
            ),
            summary=(
                "All systems are nominal. Goal and task tracking is active, "
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
                "Review priorities and adjust before execution."
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

        agent_ids = [a["id"] for a in agents]
        avg_confidence = sum(a.confidence for a in assessments) / len(assessments) if assessments else 0.75

        consensus_summary = (
            f"All {len(agents)} participating agent{'s' if len(agents) != 1 else ''} concur that "
            f"'{short_title}' requires structured, cross-domain execution. "
            "The consensus priority is: establish strategic clarity first, then assess resource and "
            "knowledge requirements before committing to a timeline."
        )

        disagreements: list[str] = []
        if "strategy" in agent_ids and "finance" in agent_ids:
            disagreements.append(
                "Strategy Agent prioritizes goal alignment and long-term milestones, "
                "while Finance Agent recommends budget validation before any resource commitment."
            )
        if "study" in agent_ids and "career" in agent_ids:
            disagreements.append(
                "Study Agent focuses on skill acquisition as the primary enabler, "
                "whereas Career Agent emphasizes network leverage for faster progress."
            )
        if "health" in agent_ids:
            disagreements.append(
                "Health Agent flags current recovery status as a potential constraint "
                "on the execution intensity proposed by other agents."
            )

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
            consensus_summary=consensus_summary,
            disagreements=disagreements,
            overall_confidence=round(avg_confidence, 2),
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
        history: list[dict] | None = None,
    ) -> ChatResponse:
        return ChatResponse(
            reply="AI provider unavailable.",
            suggested_actions=[],
            follow_up_questions=[],
            recommended_actions=[],
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

    def generate_daily_plan(
        self,
        user_name: str,
        plan_date: str,
        user_context: str | None = None,
    ) -> DailyPlan:
        now = datetime.now(timezone.utc).isoformat()
        has_goals    = bool(user_context and "GOALS"           in user_context)
        has_tasks    = bool(user_context and "TASKS"           in user_context)
        has_calendar = bool(user_context and "CALENDAR"        in user_context)
        has_emails   = bool(user_context and "UNREAD MESSAGES" in user_context)

        focus_blocks = [
            FocusBlock(
                time_range="09:00 – 10:30",
                activity="Deep work: advance highest-priority task",
                task_title=None,
                energy_level="high",
            ),
            FocusBlock(
                time_range="11:00 – 12:00",
                activity="Goal strategy review and alignment" if has_goals else "Strategic review and planning",
                task_title=None,
                energy_level="high",
            ),
            FocusBlock(
                time_range="14:00 – 15:30",
                activity="Execution sprint: secondary tasks and communications",
                task_title=None,
                energy_level="medium",
            ),
            FocusBlock(
                time_range="16:30 – 17:00",
                activity="Daily review, capture, and next-day preparation",
                task_title=None,
                energy_level="low",
            ),
        ]

        priority_tasks = [
            PriorityTask(
                rank=1,
                title="Complete top critical task",
                priority="critical",
                estimated_duration="90 min",
                linked_goal=None,
                reason=(
                    "Critical tasks carry the highest cost of deferral. "
                    "Clear before accepting any new work."
                ),
            ),
            PriorityTask(
                rank=2,
                title="Advance active goal — next milestone action",
                priority="high",
                estimated_duration="60 min",
                linked_goal="Active goal" if has_goals else None,
                reason=(
                    "Goal velocity requires daily forward motion. "
                    "At least one goal-linked action must advance today."
                ),
            ),
            PriorityTask(
                rank=3,
                title="Inbox triage and high-priority communications" if has_emails else "Review backlog and defer low-value items",
                priority="medium",
                estimated_duration="30 min",
                linked_goal=None,
                reason=(
                    "Deferred communications compound into planning debt — triage early."
                    if has_emails else
                    "An uncurated backlog silently grows and obscures true priorities."
                ),
            ),
        ]

        schedule_conflicts: list[str] = []
        if has_calendar:
            schedule_conflicts.append(
                "Deep-work block (09:00–10:30) may overlap with calendar events — "
                "verify and protect before committing to the schedule."
            )

        recommended_agent_actions = [
            "Strategy Agent: Confirm today's highest-leverage action aligns with the active goal stack.",
            "Task Manager: Close or defer overdue tasks before starting new work.",
            "Analytics Engine: Verify task completion rate is on target — if below baseline, reduce WIP first.",
        ]
        if has_emails:
            recommended_agent_actions.append(
                "Email Intelligence: Triage high-priority inbox before the 11:00 block."
            )

        risks = [
            "Context switching between tasks reduces deep-work output — protect the 09:00 block from all interruptions.",
            "Goals without today's task progress stall — ensure at least one goal-linked action is captured.",
        ]
        if has_tasks:
            risks.append(
                "Overdue tasks silently accumulate — run a quick backlog scan before the end-of-day review."
            )

        suggested_queue_items = [
            SuggestionItem(
                id=str(uuid.uuid4()),
                title="Create task: Today's #1 execution anchor",
                description=(
                    "Capture your single highest-priority action for today as a tracked task "
                    "to prevent priority drift during the day."
                ),
                source_agent="strategy_agent",
                suggested_action_type="create_task",
                risk_level="low",
                reason=(
                    "Daily plans without a concrete #1 task have no execution anchor — "
                    "the plan evaporates under distraction."
                ),
                payload_preview={
                    "title": "Today's top priority execution action",
                    "priority": "critical",
                    "status": "todo",
                },
                created_at=now,
            ),
            SuggestionItem(
                id=str(uuid.uuid4()),
                title="Generate 7-day sprint plan",
                description=(
                    "Produce a structured 7-day execution plan to align today's work "
                    "with your current goals and task backlog."
                ),
                source_agent="strategy_agent",
                suggested_action_type="generate_plan",
                risk_level="low",
                reason=(
                    "A daily plan is strongest when embedded in a weekly horizon — "
                    "ad-hoc days fragment strategy."
                ),
                payload_preview={
                    "prompt": "Generate a 7-day sprint plan aligned to active goals and current task backlog",
                    "planning_horizon_days": 7,
                },
                created_at=now,
            ),
        ]

        goal_clause = "Goal velocity requires at least one milestone action before end of day. " if has_goals else ""
        email_clause = (
            "Inbox triage is scheduled for the mid-morning slot — "
            "do not let it bleed into the morning deep-work block. "
            if has_emails else ""
        )
        overview = (
            f"Today's operational plan\n{user_name}\n{plan_date}\n"
            "Four structured focus blocks protect deep-work time while maintaining "
            "communication and review cycles. "
            f"Key constraint: context switching. "
            f"{goal_clause}"
            f"{email_clause}"
            "Close the day with a review and next-day capture session."
        )

        return DailyPlan(
            plan_date=plan_date,
            overview=overview,
            focus_blocks=focus_blocks,
            priority_tasks=priority_tasks,
            schedule_conflicts=schedule_conflicts,
            recommended_agent_actions=recommended_agent_actions,
            risks=risks,
            suggested_queue_items=suggested_queue_items,
            generated_at=now,
        )
