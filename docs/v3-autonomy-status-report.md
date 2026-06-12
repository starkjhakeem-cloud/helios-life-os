# HELIOS V3 Autonomy Layer — Status Report

**Date:** 2026-06-12
**Branch:** helios-v3
**Status:** Feature-Complete (pending final production hardening)

---

## Implemented Autonomy Features

### V3.1 — Autonomy Queue Foundation
- `AutonomyQueueItem` model with `pending → approved/rejected → completed` lifecycle
- `POST /autonomy/queue` — operator or AI adds items for review
- `PATCH /autonomy/queue/{id}` — approve or reject
- `POST /autonomy/queue/{id}/execute` — explicit, per-item execution only

### V3.2 — Proactive Planning Suggestions
- `GET /autonomy/suggestions` — AI scans user context and returns ephemeral suggestions
- Each suggestion carries `source_agent`, `risk_level`, `suggested_action_type`, `reason`
- Operator promotes suggestions to queue via `POST /autonomy/queue`

### V3.3 — Daily Plan Generator
- `POST /autonomy/daily-plan` — AI generates structured daily plan (focus blocks, priority tasks, risks)
- Includes `suggested_queue_items` the operator can promote to queue
- Ephemeral: never auto-persisted

### V3.4 — Autonomy Execution Bridge
- Execution engine in `POST /autonomy/queue/{id}/execute`
- Supported action types: `create_task`, `create_goal`, `update_task_status`, `generate_plan`
- All other types are rejected at the API boundary

### V3.5 — Approval Rules System
- `AutonomyRule` model: per-user rules per `(action_type, risk_level)` pair
- Rules can block execution (`allow_execution=False`) or require manual approval
- Wildcard rules: `risk_level=null` matches all risk levels
- Checked at execute time — blocking rule returns 403

### V3.6 — Autonomy Audit Log
- `AutonomyAuditLog` model — immutable record of all autonomy decisions
- 7 event types: suggestion_created, queue_item_created, queue_item_approved, queue_item_rejected, queue_item_executed, execution_blocked_by_rule, execution_failed
- `GET /autonomy/audit-log` with limit/offset pagination

### V3.7 — Autonomy Notifications Foundation
- `Notification` model — in-app inbox scoped per user
- 6 event types: new_suggestion, queue_item_created, approval_required, execution_blocked, execution_completed, execution_failed
- `GET /notifications`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all`, `DELETE /notifications/{id}`
- Integrated with tab bar badge (unread count)

### V3.8 — Background Job Architecture Foundation
- `BackgroundJob` model — user-configurable job scheduling intent
- 4 job types: daily_briefing_generation, proactive_suggestion_scan, reminder_check, integration_sync_simulation
- CRUD endpoints at `/api/v1/background-jobs`
- One job per type per user enforced at API level

### V3.9 — Scheduled Daily Briefings
- `POST /background-jobs/{id}/trigger` executes `daily_briefing_generation`
- Generates a live briefing via the AI provider using the full DAILY_BRIEFING context scope
- Emits an `execution_completed` notification when done
- Updates `last_run_at` on the job record
- Briefing content is not persisted separately — users retrieve live briefings from the Home screen

### V3.10 — Scheduled Proactive Scans
- `POST /background-jobs/{id}/trigger` for `proactive_suggestion_scan`
- Runs full context scan via PLANNING scope, calls `generate_suggestions()`
- Each generated suggestion is written to `autonomy_queue` as `pending` — requires manual review
- No auto-execution at any point
- Emits `new_suggestion` notification with count of items created

### V3.11 — Multi-Agent Coordination Upgrade
- `OrchestrationResponse` extended with: `consensus_summary`, `disagreements`, `overall_confidence`
- Mock provider computes `overall_confidence` as average of agent confidences
- Mock provider generates contextual `consensus_summary` and `disagreements` based on participating agents
- OpenAI provider prompt updated to request these fields; parsed defensively with fallbacks
- Frontend `OrchestrationResultCard` shows the new consensus panel above the coordinated plan

### V3.12 — Autonomy Command Center
- `autonomy.tsx` upgraded to Command Center layout
- Hero retitled "Command Center"
- Status row shows real-time counts: PENDING, APPROVED, INBOX (unread), JOBS (enabled)
- SCHEDULED JOBS panel shows all configured background jobs with "RUN" trigger buttons
- All existing sections preserved: Daily Plan, Suggestions, Queue, Rules, Audit Log

### V3.13 — Safety & Governance Audit
See `docs/v3-governance-audit.md` for the full audit report.

---

## Safety Model

1. **No autonomous execution** — all execution requires explicit operator trigger via `POST /queue/{id}/execute`
2. **Queue as review gate** — all AI-generated items enter the queue as `pending`, requiring approval
3. **Execution bridge whitelist** — only 4 safe action types accepted: create_task, create_goal, update_task_status, generate_plan
4. **Approval rules** — operators can block any action type at any risk level via `AutonomyRule`
5. **Audit trail** — every significant autonomy decision is recorded in `autonomy_audit_log`
6. **User isolation** — all queries filter by `current_user.id`; cross-user access is impossible
7. **JWT protection** — all endpoints require valid Bearer token via `Depends(get_current_user)`

---

## Known Limitations

1. **No real background scheduler** — jobs are triggered manually or not at all; no Celery/Redis/cron
2. **Briefings not persisted** — `daily_briefing_generation` trigger generates and notifies but does not store the briefing in a dedicated table
3. **Proactive scan is on-demand** — scans only run when the user visits the suggestions screen or manually triggers the job
4. **No push notifications** — only in-app inbox; no OS-level push delivery
5. **Mock AI provider** — most AI responses are deterministic mocks when `AI_PROVIDER` is unset; set `AI_PROVIDER=openai` with a valid `OPENAI_API_KEY` for live responses
6. **No reminder overdue detection** — `reminder_check` job counts all reminders, not specifically overdue ones (a dedicated overdue index was not added)

---

## V3 Readiness Assessment

| Area | Status |
|------|--------|
| Autonomy queue | ✅ Production-ready |
| Execution bridge | ✅ Production-ready |
| Approval rules | ✅ Production-ready |
| Audit logging | ✅ Production-ready |
| In-app notifications | ✅ Production-ready |
| Background job config | ✅ Production-ready |
| Job trigger/execution | ✅ Functional (no scheduler) |
| Multi-agent orchestration | ✅ Production-ready |
| Command Center UI | ✅ Production-ready |
| Real scheduled execution | ❌ Deferred (needs Celery/Redis) |
| Push notifications | ❌ Deferred (needs APNs/FCM setup) |
