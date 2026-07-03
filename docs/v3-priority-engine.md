# HELIOS V3 Priority Engine

Date: 2026-07-02  
Status: Implemented

## Purpose

HELIOS V3 uses one deterministic priority engine for executive recommendations. The engine lives at:

`backend/app/services/priority_engine.py`

It powers:

- Daily Brief
- Today's Flow and task suggestions
- Next Best Action
- Build My Day
- Assistant context

Product surfaces should not add separate ranking rules. If a surface needs to answer "what should I do next?", it should call `PriorityEngine` or an endpoint backed by it.

## Architecture

The engine has two layers:

1. `EmailPriorityClassifier`
   Classifies mail before it can influence recommendations. It is provider-agnostic and uses sender/domain, subject, snippet, metadata, importance, and labels as signals. Gmail labels are allowed as one signal, but never as the whole decision.

2. `PriorityEngine`
   Builds a normalized priority context from goals, tasks, calendar, email, current time, available windows, AI memory, daily history, user preferences, active focus blocks, and connected services. It emits ranked actions plus a single `next_best_action`.

`PriorityEngine` consumes `RealTimeAwarenessEngine` for current local time,
calendar availability, weather, task load, goal state, and connected-service
state. Awareness architecture is documented in
`docs/v3-real-time-awareness-engine.md`.

Every ranked recommendation follows this contract:

```ts
type HeliosRecommendation = {
  id: string;
  type: "goal" | "task" | "calendar" | "email" | "planning" | "recovery" | "assistant" | "none";
  title: string;
  description: string;
  score: number;
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
  impact: "low" | "medium" | "high";
  effortMinutes?: number | null;
  sourceIds: {
    goalId?: string | null;
    taskId?: string | null;
    eventId?: string | null;
    emailId?: string | null;
  };
  action: {
    label: string;
    route?: string | null;
    operation?: string | null;
  };
};
```

## Email Filtering

Email is classified as `high`, `medium`, or `low`.

High-value examples:

- Calendar invitations
- WGU and school messages
- GitHub review/security/workflow messages
- Apple Developer account messages
- Financial, government, healthcare, and security alerts
- Password/sign-in/verification messages
- Important contacts supplied by metadata or contact labels

Medium-value examples:

- Shipping and delivery updates
- Subscription renewals
- Utility bills, invoices, receipts, and payment reminders

Low-value examples:

- Promotions
- Coupons and shopping ads
- Newsletters and digests
- Social media notifications
- Spam or archived/trashed mail

Only `recommendation_eligible` email reaches the priority engine. Promotions can be unread, urgent, or marked important by a provider and still be filtered out if the classifier finds promotional/newsletter signals without critical context.

## Shared Outputs

`build_priority_context(user_id, target_date)` returns:

- `recommendations`
- `ranked_actions`
- `today_flow`
- `next_best_action`
- `focus_recommendation`
- `important_email`
- `available_windows`
- `warnings`
- filtered email counts
- normalized Daily Brief context collections

`get_next_best_action(user_id)` returns the single highest-value action with the existing API shape.

`build_task_suggestion_drafts(user_id, sources, limit)` generates Task Engine suggestions from the same ranked actions.

`build_day_schedule(user_id, target_date, commit=True)` builds a structured Build My Day plan from fixed calendar events, ranked tasks, active goals, important email, and free windows. It returns `summary`, `primaryFocus`, `scheduleBlocks`, `topTasks`, `warnings`, and backward-compatible scheduled item fields. With `commit=False`, it previews the plan without writing calendar events.

`compact_priority_package(user_id, target_date)` gives Assistant context a small prompt-safe package.

## Surface Integration

Daily Brief:

- `DailyBriefService._build_context` calls `PriorityEngine`.
- Brief counts and email sections now use filtered high-value email only.
- Summary copy leads with the recommended action when one exists.

Today's Flow / Recommended Tasks:

- `TaskEngineService.generate_suggestions` calls `PriorityEngine.build_task_suggestion_drafts`.
- `SuggestedTasksResponse.recommendations` exposes normalized `HeliosRecommendation` objects for Home Today's Flow.
- Source filters still work for `gmail`, `email`, `calendar`, `goals`, `daily_brief`, `assistant_context`, and `next_best_action`.

Next Best Action:

- `TaskGoalCalendarService.get_next_best_action` delegates to `PriorityEngine`.
- This keeps the relationship endpoint consistent with Daily Brief and task suggestions.

Build My Day:

- `POST /api/v1/task-engine/build-day`
- Request: `{date?: "YYYY-MM-DD", commit?: boolean, max_items?: number}`
- Response: `summary`, `primaryFocus`, `scheduleBlocks`, `topTasks`, `warnings`, scheduled items, unscheduled ranked actions, remaining windows, normalized recommendations, and the shared next best action.
- Fixed calendar events block time first; overdue/due/high-impact work, important email, goal recovery, and planning blocks are then fit into open windows.
- Fully booked days return constrained untimed priorities and warnings instead of failing.
- The mobile calendar action previews the generated plan first and commits task blocks only when the user accepts it.

Recovery and planning:

- Active goals with no open tasks generate `recovery` recommendations.
- Free calendar windows with meaningful open work generate `planning` recommendations.
- Calendar conflicts generate critical `calendar` recommendations.

Assistant:

- `AssistantContextService` injects `priority_intelligence`.
- The prompt summary includes a `PRIORITY ENGINE` section with next best action, Today's Flow, and email filter counts.
- Day-planning prompts such as "Build my day", "Plan my day", and "What should I do today?" also include a `BUILD MY DAY PLAN` section generated by the same priority engine.
- Recent email context also uses `EmailPriorityClassifier`.

## Validation

Focused tests live in `backend/tests/test_priority_engine.py` and cover:

- Promotions are downgraded even when unread/urgent/provider-important.
- Daily Brief and task suggestions ignore promotional email.
- Daily Brief, relationship Next Best Action, and task suggestions agree.
- Build My Day creates structured plans, previews without manual input, respects fixed events, handles fully booked/empty days, includes important email, and excludes promotions.
- Assistant context uses the priority engine and excludes low-value email.
- Overdue and due-today tasks outrank generic goals and low-value email.
- Apple Developer email can generate an email recommendation.
- Active goals with no tasks produce recovery recommendations.
- Free calendar windows produce planning recommendations.
- Recommendations are sorted by score and include action targets.

Run:

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m pytest tests/test_priority_engine.py tests/test_daily_brief.py tests/test_task_engine.py tests/test_relationship_logic.py tests/test_assistant_context_service.py
```
