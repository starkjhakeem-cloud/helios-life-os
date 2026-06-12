# HELIOS V3 — Safety Principles

**Version:** V3 Planning  
**Date:** 2026-06-12  
**Status:** Planning — no code changes yet

This document defines the safety model for V3 autonomy. It is a binding contract between the system and the operator, not aspirational guidance. Every V3 feature must pass the tests in this document before shipping.

---

## Core Philosophy

HELIOS V3 operates under one inviolable rule:

> **HELIOS proposes. The operator decides. The system executes.**

Autonomy in V3 does not mean HELIOS acts unilaterally. It means HELIOS does the monitoring, analysis, and proposal work so the operator can make high-quality decisions in seconds rather than minutes. The human is always the final authority.

This principle applies without exception. It is not overridden by convenience, user preference settings, or the quality of the AI's recommendation. An action with 99% AI confidence still requires the same confirmation step as an action with 60% confidence.

---

## The Confirmation Model

### Every autonomous action must:

1. **Be written to `pending_actions`** before anything executes
2. **Include a human-readable `context` field** explaining why HELIOS is proposing it — not just what it proposes
3. **Have an expiry** (default 24 hours) after which it silently expires without executing
4. **Be individually dismissible** — operators can always say "no" to any proposal
5. **Be logged in `action_log`** whether approved, dismissed, or expired

### No autonomous action may:

1. Execute without the operator tapping "Approve" (or equivalent explicit confirmation)
2. Skip the queue and call `execute` directly from a background worker
3. Be pre-approved by a setting ("always approve email-to-task suggestions" is not a valid V3 control — every action gets a confirmation in V3)
4. Execute partially — if an action has multiple steps, all steps are shown and approved together
5. Be reversed silently — if an approved action has an error, the operator is notified; no silent rollback

### Confirmation UX requirements:

- The operator must see **what will happen** (the action) and **why HELIOS proposed it** (the context) before approving
- Approve and Dismiss must be equally prominent — no dark patterns making it easier to approve
- Batch approval ("approve all") is permitted only for the `approve_daily_plan` action type, and only when the operator has seen the full plan list first
- A confirmation cannot be triggered programmatically — it requires a physical tap

---

## What V3 Will NEVER Do Automatically

The following actions are permanently excluded from autonomous execution in V3, regardless of user settings, AI confidence, or operator instructions:

### Data deletion
- Will never delete a goal, task, memory, reminder, or any user record
- Will never archive or trash a calendar event
- Will never permanently delete an email
- Will never remove an integration or revoke stored tokens automatically

### Communication
- Will never send an email on the operator's behalf — not a reply, not a draft, not a forward
- Will never create a calendar event that appears in the operator's Google Calendar
- Will never post to any external service, social platform, or communication tool
- Will never send a message to any third party

### Financial or resource actions
- Will never interact with any financial service, payment system, or subscription
- Will never make purchases, upgrades, or plan changes

### Credential and security operations
- Will never generate, rotate, or expose API keys or secrets
- Will never change authentication settings, passwords, or OAuth scopes
- Will never share tokens with external services beyond the explicitly configured Google OAuth endpoint

### Goal and task modification
- Will never change the status of a goal (active → completed) autonomously
- Will never delete or modify a task the operator did not initiate — only propose changes
- Will never link tasks to goals without confirmation

### Settings and configuration
- Will never change user preferences or notification settings autonomously
- Will never disable or modify alert rules
- Will never change the daily briefing schedule

---

## Risk Controls

### Rate Limiting on Autonomous Proposals

To prevent the action queue from becoming overwhelming:

| Proposal type | Max per day | Max pending at once |
|--------------|-------------|-------------------|
| Email-to-task | 5 | 10 |
| Calendar suggestions | 3 | 5 |
| Daily plan | 1 | 1 |
| Alerts | 5 | 20 |

When a cap is reached, new proposals are silently discarded (not queued) until existing proposals are resolved. The operator is not notified of discarded proposals — volume management is invisible.

### Deduplication

The `pending_actions` table has no unique constraint on `(user_id, action_type)` — the same action type may be proposed multiple times. However, each service that writes proposals MUST implement its own deduplication logic:

- `EmailIntelligenceService`: never proposes the same `email_id` twice (tracked via `EmailMessage.proposed_task_id`)
- `CalendarIntelligenceService`: uses a `dedup_key` based on `(event_id, suggestion_type)` — checked before inserting
- `AlertWorker`: uses the `alerts.dedup_key` unique constraint

### Rollback on Approved-Action Failure

When an approved action fails at execution:
1. The `action_log` entry records `result.success = false` and the error
2. A notification is sent: "HELIOS could not complete: [action title]. Tap to review."
3. The data state is NOT automatically rolled back — the operator decides what to do
4. The specific action is NOT automatically re-queued

### Circuit Breaker for Background Workers

If a background worker fails 3 consecutive runs for the same job:
1. The job is paused (status = `paused` in `scheduled_jobs`)
2. An `alert_urgent` is written: "HELIOS background job [type] has been paused after repeated failures. Tap to review."
3. The job does NOT restart automatically
4. The operator must review and manually re-enable via a settings action (V3+ UI)

This prevents a misconfigured credential or network partition from generating hundreds of error log entries.

### Token Exposure Prevention

All V2 token security rules are preserved and extended:

- `TokenRefreshWorker` never logs token values — only `type(exc).__name__` on failures
- Refreshed tokens are encrypted with Fernet before writing to the DB
- The `action_log.payload` field never contains token values
- Push notification payloads never contain token values
- The `pending_actions.context` field never contains token values

### Audit Trail Integrity

The `action_log` table is append-only by application convention:
- No application code issues `UPDATE` or `DELETE` against `action_log`
- The table has no soft-delete column — records are permanent
- Approved and dismissed actions are both logged (dismissed with `result = {success: false, reason: "dismissed_by_operator"}`)
- The `action_log` is scoped per-user — the current user can only read their own log

---

## Threat Model

### What could go wrong, and how it is mitigated:

| Threat | Impact | Mitigation |
|--------|--------|-----------|
| Background worker acts without confirmation | High | Structural: workers only write to `pending_actions`, never call `execute` |
| Malicious pending_action payload | Medium | All `execute` endpoints validate payload schemas (Pydantic) and ownership (user_id check) |
| Token leaked in notification | High | Notification payloads contain only display text and entity IDs, never credentials |
| Runaway worker floods action queue | Medium | Per-day caps by proposal type; hourly cleanup job expires old entries |
| Expired token used for real API call | High | `TokenRefreshWorker` runs before sync; adapter `_get_access_token` checks expiry before calling API |
| Worker runs as wrong user | High | Every worker call is scoped with `user_id` + DB ownership filter — no cross-user data access |
| Push notification intercepted | Low | Push payload contains no sensitive data; deep link requires authentication to act |
| AI proposes harmful action | Medium | V3 action type set excludes destructive operations (delete, send email, create calendar event) |

### What V3 does NOT protect against:

- A compromised operator account (HELIOS trusts the authenticated user)
- Google API side-channel attacks (HELIOS uses standard OAuth flows)
- Physical access to the device (outside scope)

---

## Operator Control Mechanisms

### "Pause Autonomy" setting (V3.4+)

A single toggle in User Preferences: **Autonomy Mode: On / Off**.

When Off:
- All background workers still run (token refresh, sync)
- No proposals are written to `pending_actions`
- No push notifications are sent for proposals
- Alerts are still generated (alerts are informational, not action proposals)
- The daily briefing still generates at the configured time but is not pushed

This gives the operator a single control to suspend proactive behaviour without losing sync or token freshness.

### Per-source disable

Operators can individually disable:
- Email intelligence proposals (don't propose tasks from emails)
- Calendar intelligence proposals (don't propose scheduling changes)
- Daily plan (don't auto-generate an orchestrated daily plan)

Alerts cannot be individually disabled in V3 (they are always informational; disabling them would hide real urgency signals). A "Do Not Disturb" mode silences notifications but still writes to the alert inbox.

### Manual trigger escape hatch

All V3 autonomous workflows can also be triggered manually:
- "Run sync now" button on Integrations screen
- "Generate daily plan" button on Agents screen
- "Generate briefing" pull-to-refresh on Home screen

Operators who prefer not to use scheduled autonomy can disable automation and trigger everything manually.

---

## Pre-Shipping Safety Checklist

Every V3 phase must pass this checklist before merging:

### Code review gates
- [ ] No background worker calls any `execute` endpoint directly
- [ ] Every new `pending_actions` insert includes a non-empty `context` field
- [ ] Every new `action_type` is explicitly handled in the mobile Action Queue UI
- [ ] No token value appears in any log statement (search for `access_token`, `refresh_token`, `Bearer`)
- [ ] Every DB query in a background worker filters by `user_id`

### Functional tests
- [ ] Proposed action does NOT execute when the user never opens the app (expiry path)
- [ ] Dismissed action is logged and NOT re-proposed for the same source entity
- [ ] Briefing generates correctly when user has zero goals, zero tasks, zero emails, zero calendar events
- [ ] Token refresh runs before sync when token is within 5 minutes of expiry
- [ ] Circuit breaker pauses job after 3 consecutive failures

### Security tests
- [ ] A pending action created for user A cannot be approved by user B
- [ ] `action_log` returns only the current user's entries
- [ ] Push notification payload contains no OAuth tokens or JWT values

---

## What "Safe Autonomy" Means for V3

V3 autonomy is safe because it is **narrow, reversible, and operator-confirmed.**

**Narrow:** HELIOS can only propose actions that already exist in the `ExecutableActionType` set. It cannot invent new action types at runtime.

**Reversible:** Every action HELIOS can propose (create task, create goal, update task status, adjust due date) can be undone by the operator manually. HELIOS never takes actions that are inherently irreversible (delete, send email, create calendar event).

**Operator-confirmed:** No action executes without an explicit approval tap. The queue is persistent — proposals survive app restarts and don't pressure the operator to decide quickly.

These three properties hold even when the AI provider is OpenAI with live user data. The safety layer is architectural, not behavioural — it doesn't depend on the AI "knowing better."
