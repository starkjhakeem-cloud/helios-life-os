from datetime import datetime, timezone

from app.ai.base import AIProvider
from app.schemas.ai import BriefingPriority, DailyBriefing, PlanResponse, PlanStep


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
