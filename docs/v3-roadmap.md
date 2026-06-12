# HELIOS V3 — Roadmap: The Autonomy Layer

**Version:** V3 Planning  
**Date:** 2026-06-12  
**Status:** Planning — no code changes yet  
**Branch target:** helios-v3 (from helios-v2)  
**Theme:** HELIOS moves from intelligence to safe autonomy.

---

## What V3 Is

V1 gave HELIOS a brain — persistent data, AI reasoning, structured context.  
V2 gave HELIOS eyes — integration architecture, real data sources, encrypted credential storage.  
V3 gives HELIOS initiative — the ability to act on your behalf, safely, with your explicit approval.

V3 is not a chatbot upgrade. It is a systematic shift in how HELIOS operates: from "answer when asked" to "monitor, propose, and execute when confirmed." Every autonomous action remains under full operator control. HELIOS never acts without a human in the loop.

---

## V3 Goals

### Primary Goals

1. **Activate real Google OAuth** — flip `_STUB_EXCHANGE = False` and `_STUB = False` with all required prerequisites in place (CSRF state, PKCE, token refresh, credential setup). V3.1 completes the pipeline V2 built.

2. **Background job infrastructure** — persistent, recoverable background jobs for: token refresh, scheduled syncs, daily briefing generation, and deadline monitoring. No real-time dependency on a user request.

3. **Proactive daily planning** — HELIOS generates a morning briefing and proposed daily task order automatically at a user-configured time. Delivered as a push notification; the operator approves or adjusts before HELIOS acts.

4. **Email-to-task intelligence** — HELIOS reads unread high-priority emails from Gmail (once real OAuth is active) and proposes task creation. No email is auto-created as a task without explicit approval.

5. **Calendar-aware scheduling** — HELIOS reads real calendar events and proposes task due-date adjustments, focus-block scheduling, and conflict alerts. No calendar event is created or modified without approval.

6. **Action queue and audit trail** — every autonomous proposal lives in a pending action queue. Users can review, approve, modify, or dismiss. Every executed action is permanently logged.

7. **Smart alert system** — proactive notifications for: overdue tasks, approaching goal deadlines, goal drift (no task progress in N days), and calendar conflicts. Informational only; no automatic changes.

### Non-Goals (What V3 Will NOT Do)

See [docs/v3-safety-principles.md](v3-safety-principles.md) for the full list. Summary:

- V3 will NOT delete any data autonomously
- V3 will NOT send emails on the operator's behalf
- V3 will NOT create calendar events without confirmation
- V3 will NOT modify existing goals or tasks without explicit user approval
- V3 will NOT make financial decisions or external API calls beyond Google Calendar and Gmail
- V3 will NOT store or transmit any data outside the operator's own infrastructure

---

## Prerequisites Before V3 Work Begins

All V2 phases must be complete. The following V2 items are required before any V3 phase can start:

| Prerequisite | Status | Notes |
|---|---|---|
| V2 migrations applied | ✅ Done | DB at migration 012 |
| Real Google credentials in `.env` | ⬜ Pending | GCP Console setup required |
| State token persistence (CSRF) | ⬜ Pending | V3.1 implements this |
| Mobile deep-link intercept | ⬜ Pending | V3.1 implements this |
| Token refresh service | ⬜ Pending | V3.2 implements this |
| PKCE for mobile OAuth | ⬜ Pending | V3.1 implements this |
| `gmail.send` scope removed | ⬜ Pending | Required before real OAuth |

---

## Recommended V3 Phases

### V3.1 — Real Google OAuth Activation

**Goal:** Flip the two stub flags and establish a fully working OAuth flow.

**Scope:**
- Remove `gmail.send` from all three scope lists (per V2.21 checklist)
- Add state token persistence (Redis or DB table with TTL) for CSRF protection
- Implement PKCE: `code_challenge` in connect URL, `code_verifier` in exchange
- Replace stub `handleGoogleConnect` in `integrations.tsx` with `expo-web-browser` `openAuthSessionAsync`
- Parse `code` and `state` from the returned deep link
- Flip `_STUB_EXCHANGE = False` in `google_oauth.py`
- Test full round-trip: connect URL → Google consent → callback → token exchange → encrypted storage

**V3.1 does NOT flip `_STUB = False` on the adapters** — real API calls wait for V3.2 infrastructure.

**Key files:**
- `backend/app/routers/integrations.py` — state persistence, PKCE
- `backend/app/services/google_oauth.py` — flag flip, PKCE support
- `mobile/src/app/(tabs)/integrations.tsx` — `openAuthSessionAsync` flow

---

### V3.2 — Background Job Infrastructure

**Goal:** A persistent, recoverable background job system that runs independently of user requests.

**Scope:**
- Choose and integrate a job scheduler (APScheduler with PostgreSQL job store recommended; see [v3-autonomy-architecture.md](v3-autonomy-architecture.md) for rationale)
- New migration: `scheduled_jobs` table (job type, scheduled_at, last_run_at, status, config JSON)
- Implement `TokenRefreshWorker`: checks all `user_integrations` rows where `token_expires_at < now() + 5min`, refreshes via Google token endpoint, re-encrypts and stores
- Implement `SyncWorker`: reads real calendar events and emails from Google APIs, upserts into `calendar_events` and `email_messages`
- Flip `_STUB = False` on both adapters (after token refresh is working)
- New endpoint: `GET /api/v1/admin/jobs/status` (admin-only health check for job runner state)

**Key new files:**
- `backend/app/jobs/scheduler.py` — job runner initialisation
- `backend/app/jobs/token_refresh.py` — token refresh worker
- `backend/app/jobs/sync_worker.py` — real sync (replaces `sync_simulator`)
- `backend/alembic/versions/013_scheduled_jobs.py`

---

### V3.3 — Action Queue and Audit Trail

**Goal:** A database-backed queue where all AI-proposed actions sit until the operator approves or dismisses them.

**Scope:**
- New migration: `pending_actions` table (action type, proposed_by, payload, status, expires_at, created_at)
- New migration: `action_log` table (action type, payload snapshot, executed_by, executed_at, result)
- New endpoint group: `GET /ai/actions/pending`, `POST /ai/actions/{id}/approve`, `DELETE /ai/actions/{id}`
- Mobile: new "Action Queue" section in the assistant or agents screen showing pending proposals
- All future V3 autonomous proposals write to `pending_actions` rather than directly executing
- Approved actions execute via the existing `POST /ai/actions/execute` endpoint and log to `action_log`
- Pending actions expire after 24 hours (configurable) — a background job cleans them up

**Key new files:**
- `backend/app/models/pending_action.py`
- `backend/app/models/action_log.py`
- `backend/app/routers/action_queue.py`
- `backend/alembic/versions/014_action_queue.py`

---

### V3.4 — Proactive Daily Briefing

**Goal:** HELIOS generates a morning briefing automatically at a user-configured time, pushes a notification, and presents the briefing on the next app open without requiring a manual refresh.

**Scope:**
- New field in `user_preferences`: `daily_briefing_time` (HH:MM UTC string, nullable — null disables automation)
- New migration: `push_tokens` table (user_id, token, device_platform, created_at)
- New endpoint: `POST /api/v1/device/push-token` — stores Expo push token on login
- Background job: `DailyBriefingWorker` — queries users with `daily_briefing_time` due within the next minute, runs `build_context(DAILY_BRIEFING)` + AI briefing, stores result in a `daily_briefings` cache table, sends push notification via Expo Push API
- Mobile: on foreground resume, fetch the most recent pre-generated briefing first; fall back to on-demand generation if none available
- Push notification tap → deep-link to Home screen

**This phase requires Expo push notification infrastructure on the server side.** No APNs/FCM credentials are needed — Expo's push service handles the routing.

**Key new files:**
- `backend/app/jobs/daily_briefing.py`
- `backend/app/routers/device.py`
- `backend/app/models/push_token.py`
- `backend/alembic/versions/015_push_tokens_and_briefing_cache.py`

---

### V3.5 — Email Intelligence

**Goal:** HELIOS reads unread high-priority emails (real Gmail, from V3.2) and proposes task creation for emails that look actionable. No email is auto-created as a task.

**Scope:**
- New AI service: `EmailIntelligenceService` — takes a batch of unread `EmailMessage` rows and uses the AI provider to classify: is this actionable? If yes, what task title and priority?
- Classification runs on each sync (V3.2 `SyncWorker` calls this after upserting messages)
- Actionable emails write proposed tasks to `pending_actions` with type `create_task` and a link to the source email
- Mobile: action queue shows "Email-suggested task: [title] (from: [sender])" — approve creates the task, dismiss clears the proposal
- New field: `EmailMessage.proposed_task_id` (nullable FK → pending_actions) — prevents re-proposing the same email

**What this does NOT do:**
- Does not read email body content in V3.5 (subject + sender only, for privacy)
- Does not send any replies
- Does not archive or mark-as-read without explicit operator action

---

### V3.6 — Calendar Intelligence

**Goal:** HELIOS reads real calendar events and uses them to propose task scheduling and surface conflicts.

**Scope:**
- New AI service: `CalendarIntelligenceService` — scans upcoming events for: (1) focus blocks (consecutive free time → propose scheduling a high-priority task), (2) conflicts with task due dates (meeting during due-date day → propose due-date shift), (3) deadline proximity alerts (goal target date within 7 days with incomplete tasks → alert)
- All proposals go to `pending_actions`
- Mobile: "Calendar suggestion: [description]" in action queue
- New alert type: `calendar_conflict` in the alerts system (V3.7)

---

### V3.7 — Smart Alert System

**Goal:** Proactive push notifications for time-sensitive conditions. All alerts are informational — they never trigger automatic changes.

**Alert types:**
- `overdue_task` — task past due date and not done (daily digest, not per-task spam)
- `goal_drift` — active goal with no task progress in N days (N configurable, default 7)
- `deadline_approaching` — goal target date within 3 days with < 50% tasks done
- `calendar_conflict` — calendar event conflicts with a task due date
- `inbox_priority` — unread HIGH or URGENT emails older than 12 hours

**Scope:**
- New migration: `alerts` table (type, user_id, message, data JSON, status, created_at, dismissed_at)
- `AlertWorker` background job: runs every 15 minutes, evaluates conditions, writes new `alerts` rows (deduplicated — no duplicate alert for the same condition within 24h)
- Mobile: alert badge on the Home screen; tap opens a dedicated Alerts section
- All alerts can be dismissed; dismissal is persisted

---

### V3.8 — Orchestration-Driven Daily Plan

**Goal:** HELIOS runs a full multi-agent orchestration each morning and produces a proposed daily task order that the operator approves as a unit.

**Scope:**
- New orchestration mode: `DAILY_PLAN` — runs all 5 agents with the full daily context, produces a ranked list of 3–5 task recommendations for the day
- Daily plan is stored in `pending_actions` as a single action of type `approve_daily_plan`
- Approving the plan marks those tasks as `in_progress` (or sets a `focus_date` field)
- Mobile: "Your daily plan for [date]" card on the Home screen — approve all, adjust, or dismiss
- Integrates with V3.4 proactive briefing: plan is included in the morning notification

---

## V3 Phases Summary

| Phase | Name | Key deliverable | Depends on |
|-------|------|----------------|------------|
| V3.1 | Real Google OAuth | Live token exchange + encrypted storage | V2 credentials |
| V3.2 | Background Jobs | Token refresh + real sync + adapter activation | V3.1 |
| V3.3 | Action Queue | `pending_actions` + `action_log` + approval UI | V3.2 |
| V3.4 | Proactive Briefing | Morning push + pre-generated briefing | V3.2, V3.3 |
| V3.5 | Email Intelligence | Email → proposed task queue | V3.2, V3.3 |
| V3.6 | Calendar Intelligence | Calendar → scheduling proposals | V3.2, V3.3 |
| V3.7 | Smart Alerts | Proactive condition monitoring | V3.2, V3.3 |
| V3.8 | Daily Plan | Orchestration-driven daily task order | V3.4, V3.5, V3.6, V3.7 |

---

## Database Additions in V3

| Migration | Table | Purpose |
|-----------|-------|---------|
| 013 | `scheduled_jobs` | Job runner state and scheduling |
| 014 | `pending_actions` | AI-proposed actions awaiting approval |
| 014 | `action_log` | Audit trail of all executed actions |
| 015 | `push_tokens` | Expo device push tokens |
| 015 | `daily_briefings` | Pre-generated briefing cache |
| 016 | `alerts` | Smart alert inbox |

---

## What V3 Preserves

Every V1 and V2 feature is preserved unchanged:
- All CRUD endpoints (goals, tasks, analytics, reminders, preferences)
- All mock AI endpoints (briefing, chat, plan) still work when Google/OpenAI not configured
- All stub integration paths still work when real OAuth not active
- All existing migrations untouched
- The `_STUB` flag pattern is preserved — real paths are opt-in
