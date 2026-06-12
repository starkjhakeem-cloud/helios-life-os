# HELIOS V3 — Autonomy Architecture

**Version:** V3 Planning  
**Date:** 2026-06-12  
**Status:** Planning — no code changes yet

This document defines the technical architecture for V3's autonomy layer: how HELIOS proposes, queues, confirms, executes, and logs autonomous actions, and what infrastructure runs underneath it.

---

## The Autonomy Model

V3 autonomy follows a strict four-step lifecycle for every non-user-initiated action:

```
MONITOR → PROPOSE → CONFIRM → EXECUTE → LOG
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    HELIOS AUTONOMY LOOP                          │
│                                                                  │
│  Background Workers (scheduled, event-driven)                    │
│    │                                                             │
│    ├── TokenRefreshWorker        (every 30 min)                  │
│    ├── SyncWorker                (every 15 min when connected)   │
│    ├── AlertWorker               (every 15 min)                  │
│    ├── DailyBriefingWorker       (at user's configured time)     │
│    ├── EmailIntelligenceService  (after each sync)               │
│    ├── CalendarIntelligenceService (after each sync)             │
│    └── ActionQueueCleanup        (hourly — expire old proposals) │
│                    │                                             │
│                    ▼                                             │
│            pending_actions (PostgreSQL)                          │
│            ┌──────────────────────────────────────────────┐     │
│            │ id · type · proposed_by · payload · status   │     │
│            │ proposed_at · expires_at · user_id           │     │
│            └──────────────────────────────────────────────┘     │
│                    │                                             │
│                    ▼ (operator sees on next app open)            │
│            ┌─────────────────────┐                               │
│            │   Action Queue UI   │  mobile app                   │
│            │  approve / dismiss  │                               │
│            └─────────┬───────────┘                               │
│                      │ approve                                    │
│                      ▼                                           │
│            POST /ai/actions/execute (existing endpoint)          │
│                      │                                           │
│                      ▼                                           │
│            action_log (PostgreSQL) — permanent audit trail       │
└─────────────────────────────────────────────────────────────────┘
```

**No background worker ever calls `execute` directly.** Workers only write to `pending_actions`. Execution always goes through the approval step.

---

## Background Job Architecture

### Scheduler Choice: APScheduler with PostgreSQL Job Store

**Decision:** APScheduler (`apscheduler` package) with `SQLAlchemyJobStore` backed by the existing PostgreSQL instance.

**Why not Celery + Redis:**
- Celery requires Redis or RabbitMQ as a broker — a new infrastructure dependency with operational overhead
- For HELIOS V3's job volume (< 10 jobs per user, < 1000 total), APScheduler is sufficient
- APScheduler jobs persist to PostgreSQL alongside application data — no separate message broker to deploy, back up, or monitor
- APScheduler integrates cleanly into FastAPI's lifespan context (startup/shutdown)
- Celery is the right upgrade path if scale demands it — APScheduler can be replaced without changing the job logic

**Why not FastAPI BackgroundTasks:**
- `BackgroundTasks` are fire-and-forget per-request — they don't run on a schedule, don't persist, and don't recover after a crash
- `BackgroundTasks` are appropriate for short post-request work (e.g., sending a webhook), not recurring scheduled operations

### Job Store Schema

```sql
-- Created by APScheduler automatically when SQLAlchemyJobStore is configured.
-- Not a manual Alembic migration — APScheduler manages its own tables.

apscheduler_jobs (
    id          VARCHAR(191) PRIMARY KEY,
    next_run_time DOUBLE PRECISION INDEX,
    job_state   BYTEA NOT NULL        -- pickled job state
)
```

A separate `scheduled_jobs` application table tracks HELIOS-specific job metadata (run history, error counts, last result):

```sql
-- Migration 013

scheduled_jobs (
    id             TEXT PRIMARY KEY,
    job_type       VARCHAR(50) NOT NULL,   -- "token_refresh" | "sync" | "daily_briefing" | ...
    user_id        TEXT REFERENCES users(id) ON DELETE CASCADE,
    status         VARCHAR(30) NOT NULL,   -- "idle" | "running" | "completed" | "failed"
    last_run_at    TIMESTAMPTZ,
    next_run_at    TIMESTAMPTZ,
    last_error     TEXT,
    run_count      INTEGER DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL,
    updated_at     TIMESTAMPTZ NOT NULL
)
```

### Job Types and Cadence

| Job | Cadence | Per-user? | Action |
|-----|---------|-----------|--------|
| `token_refresh` | Every 30 min | System-wide scan | Refresh tokens expiring within 5 min |
| `sync_worker` | Every 15 min (when connected) | Per-user | Sync calendar + email from Google |
| `alert_worker` | Every 15 min | System-wide scan | Evaluate alert conditions for all users |
| `daily_briefing` | Once daily at configured time | Per-user | Generate briefing, push notification |
| `action_queue_cleanup` | Hourly | System-wide | Expire pending actions older than 24h |
| `email_intelligence` | After each sync | Per-user | Classify unread emails → propose tasks |
| `calendar_intelligence` | After each sync | Per-user | Scan calendar → propose scheduling |

### Scheduler Lifecycle in FastAPI

```python
# backend/app/jobs/scheduler.py (planned)

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(url=settings.database_url)},
    timezone="UTC",
)

# In FastAPI lifespan:
# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     scheduler.start()
#     yield
#     scheduler.shutdown()
```

---

## Action Queue Architecture

### Database Schema

```sql
-- Migration 014

pending_actions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proposed_by     VARCHAR(50) NOT NULL,  -- "email_intelligence" | "calendar_intelligence" | "alert_worker" | "orchestration"
    action_type     VARCHAR(50) NOT NULL,  -- mirrors ExecutableActionType + new V3 types
    payload         JSON NOT NULL,         -- the proposed action data
    context         TEXT,                  -- human-readable explanation: why HELIOS is proposing this
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',  -- "pending" | "approved" | "dismissed" | "expired"
    proposed_at     TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,  -- default: proposed_at + 24h
    resolved_at     TIMESTAMPTZ,
    source_ref      TEXT                   -- optional: email_id, calendar_event_id, etc.
)

action_log (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type     VARCHAR(50) NOT NULL,
    payload         JSON NOT NULL,         -- snapshot of what was executed (immutable)
    executed_by     VARCHAR(50) NOT NULL,  -- "operator" | "approved_from_queue"
    source_action_id TEXT REFERENCES pending_actions(id) ON DELETE SET NULL,
    result          JSON,                  -- success flag, created/updated id, message
    executed_at     TIMESTAMPTZ NOT NULL
)
```

### Action Types in V3

V3 extends `ExecutableActionType` with new types:

| Type | Proposed by | What it does |
|------|------------|-------------|
| `create_task` | Email/calendar intelligence | Existing — creates a task |
| `create_goal` | Orchestration | Existing — creates a goal |
| `update_task_status` | Calendar intelligence | Existing — updates task status |
| `adjust_task_due_date` | Calendar intelligence | NEW — shifts a task's due date |
| `schedule_focus_block` | Calendar intelligence | NEW — proposes adding a calendar block |
| `approve_daily_plan` | Orchestration worker | NEW — approves a ranked task list for the day |
| `archive_email` | Email intelligence | NEW — proposes archiving a processed email |

The `schedule_focus_block` and `archive_email` types require real Google API calls — they are only active when `_STUB = False` on the adapters.

### Action Queue API (new endpoints)

```
GET  /api/v1/ai/actions/pending          — list pending actions for current user
POST /api/v1/ai/actions/{id}/approve     — approve and execute a pending action
DELETE /api/v1/ai/actions/{id}           — dismiss a pending action
GET  /api/v1/ai/actions/log              — paginated action execution log
```

### Action Expiry

The `action_queue_cleanup` background job runs hourly and sets `status = "expired"` on any `pending_actions` rows where `expires_at < now()`. Expired actions are never executed. They remain in the table for audit purposes and are soft-deleted (status change only, not a DELETE).

---

## Notification and Alert Architecture

### Push Notification Infrastructure

HELIOS V3 uses **Expo's Push Notification service** as the notification layer. The Expo service handles APNs (iOS) and FCM (Android) routing, so HELIOS does not need to manage platform-specific credentials.

```
HELIOS Backend
    │
    ├── POST https://exp.host/--/api/v2/push/send
    │      (Expo Push API — HTTPS, no secrets required for sandbox)
    │
Expo Push Service
    │
    ├── APNs (iOS)
    └── FCM (Android)
```

**Token storage:**

```sql
-- Migration 015

push_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expo_token  TEXT NOT NULL,             -- "ExponentPushToken[...]" format
    platform    VARCHAR(20),               -- "ios" | "android"
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, expo_token)
)
```

**Registration flow:**
1. On login (or permission grant), mobile app calls `Notifications.getExpoPushTokenAsync()`
2. App sends token to `POST /api/v1/device/push-token`
3. Backend stores in `push_tokens`
4. Background workers use `push_tokens` to send notifications

### Notification Categories

| Category | Sound | Badge | Tap action | Example |
|----------|-------|-------|-----------|---------|
| `daily_briefing` | Default | ✓ | Open Home screen | "Your morning briefing is ready" |
| `action_proposed` | Soft | ✓ | Open Action Queue | "3 new proposals from HELIOS" |
| `alert_urgent` | Default | ✓ | Open Alerts | "2 tasks are overdue" |
| `alert_info` | None | — | Open Alerts | "Goal target in 3 days" |
| `sync_complete` | None | — | None (silent) | Background sync confirmation |

Notification frequency caps (per user, per day):
- `daily_briefing`: 1
- `action_proposed`: max 3 (batched, not per-action)
- `alert_urgent`: max 2
- `alert_info`: max 1

### Alert Architecture

```sql
-- Migration 016

alerts (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alert_type      VARCHAR(50) NOT NULL,
    severity        VARCHAR(20) NOT NULL,  -- "info" | "warning" | "urgent"
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    data            JSON,                   -- linked entity ids, etc.
    status          VARCHAR(20) NOT NULL DEFAULT 'unread',  -- "unread" | "read" | "dismissed"
    created_at      TIMESTAMPTZ NOT NULL,
    read_at         TIMESTAMPTZ,
    dismissed_at    TIMESTAMPTZ,
    dedup_key       TEXT,                   -- prevents duplicate alerts for same condition
    UNIQUE (user_id, dedup_key)             -- dedup_key format: "{alert_type}:{entity_id}:{date}"
)
```

The `dedup_key` constraint prevents the `AlertWorker` from generating duplicate alerts for the same condition. For example:

- `overdue_task:task-abc-123:2026-06-12` — one overdue alert per task per day
- `goal_drift:goal-xyz-456:2026-06-12` — one drift alert per goal per day
- `deadline_approaching:goal-xyz-456` — one per goal (cleared when target date passes)

---

## Agent Orchestration Upgrades

### V2 Orchestration (current)

```
User sends objective →
  POST /agents/orchestrate →
    run_orchestration() calls AI provider once per selected agent →
      OrchestrationResponse with recommended actions →
        User reviews in UI
```

**Limitation:** Purely reactive. Orchestration only happens when the user explicitly requests it.

### V3 Orchestration

```
Scheduled DailyBriefingWorker runs at configured time →
  build_context(DAILY_BRIEFING) →
    EmailIntelligenceService.classify_unread() →
    CalendarIntelligenceService.analyze_upcoming() →
  run_orchestration(scope=DAILY_PLAN) →
    Each agent produces domain-specific recommendations →
      Cross-agent coordinator produces unified ranked plan →
        Writes to pending_actions (type: approve_daily_plan) →
          Sends push notification →
            User approves plan on next app open →
              Approved tasks get focus_date = today
```

### New Orchestration Scope

```python
# context_service.py addition (planned)

class ContextScope(str, Enum):
    DAILY_BRIEFING  = "daily_briefing"    # existing
    ASSISTANT_CHAT  = "assistant_chat"    # existing
    AGENT_DETAIL    = "agent_detail"      # existing
    PLANNING        = "planning"          # existing
    DAILY_PLAN      = "daily_plan"        # NEW — V3.8
```

`DAILY_PLAN` scope includes all 8 data sources from `DAILY_BRIEFING` plus the `pending_actions` summary (how many proposals are waiting, of what types).

### Cross-Agent Coordination

V3 introduces a `CoordinatorAgent` role that receives each specialist agent's output and resolves conflicts:

- Finance and Career agents both want the same 3-hour morning block → Coordinator picks based on goal priority
- Health agent flags energy deficit → Coordinator reduces total task count for the day
- Study agent proposes a learning task → Coordinator checks if it links to an active goal; flags it as exploratory if not

The coordinator produces the final `approve_daily_plan` payload. This is a new AI prompt layer above the existing orchestration, not a replacement.

---

## Google Integration Pipeline (V3.2)

When real OAuth is active and `_STUB = False`:

```
SyncWorker (every 15 min per connected user)
│
├── google_calendar_adapter.list_events(user_id, db)
│     ├── _get_access_token(user_id, db)         ← already wired (V2.18)
│     │     └── decrypt_token(encrypted_value)   ← already wired (V2.17)
│     ├── TokenRefreshWorker.refresh_if_needed()  ← NEW V3.2
│     └── GET https://www.googleapis.com/calendar/v3/calendars/primary/events
│
├── Upsert into calendar_events by external_event_id
│
├── gmail_adapter.list_messages(user_id, db)
│     ├── _get_access_token(user_id, db, provider="gmail")
│     ├── TokenRefreshWorker.refresh_if_needed()
│     └── GET https://gmail.googleapis.com/gmail/v1/users/me/messages
│
├── Upsert into email_messages by external_message_id
│
├── EmailIntelligenceService.classify_unread(user_id, db)   ← NEW V3.5
│     └── Writes actionable proposals to pending_actions
│
└── CalendarIntelligenceService.analyze_upcoming(user_id, db) ← NEW V3.6
      └── Writes scheduling proposals to pending_actions
```

**Token refresh guard:**

```python
# planned pseudocode — backend/app/jobs/token_refresh.py

async def refresh_if_needed(user_id: str, db: Session) -> bool:
    row = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == "google_calendar",
        )
    ).scalar_one_or_none()

    if not row or not row.token_expires_at:
        return False

    buffer = timedelta(minutes=5)
    if row.token_expires_at > datetime.now(utc) + buffer:
        return False  # still fresh

    refresh_token = decrypt_token(row.refresh_token_encrypted)
    # POST https://oauth2.googleapis.com/token with grant_type=refresh_token
    # Re-encrypt new access token
    # Update row.access_token_encrypted and row.token_expires_at
    # db.commit()
    return True
```

---

## Mobile Architecture Changes

### New Screens (planned)

| Screen | Route | Purpose |
|--------|-------|---------|
| Action Queue | `(tabs)/actions.tsx` | Review and approve/dismiss pending proposals |
| Alerts | `(tabs)/alerts.tsx` | Smart alert inbox with dismiss functionality |

### New Stores (planned)

| Store | State | Key actions |
|-------|-------|------------|
| `useActionQueueStore` | `pendingActions`, `actionLog` | `fetchPending`, `approveAction`, `dismissAction` |
| `useAlertsStore` | `alerts`, `unreadCount` | `fetchAlerts`, `markRead`, `dismissAlert` |
| `useDeviceStore` | `pushToken`, `isRegistered` | `registerPushToken` |

### Push Notification Deep Links

| Notification category | Deep link | Opens |
|----------------------|-----------|-------|
| `daily_briefing` | `helios://home` | Home screen |
| `action_proposed` | `helios://actions` | Action Queue screen |
| `alert_urgent` | `helios://alerts` | Alerts screen |
| `alert_info` | `helios://alerts` | Alerts screen |

---

## Data Flow Summary

```
Real World
  (Google Calendar, Gmail)
       │
       │  HTTPS + OAuth token
       ▼
  Google APIs
       │
       │  SyncWorker (V3.2)
       ▼
  PostgreSQL
  calendar_events · email_messages
       │
       ├── EmailIntelligenceService  ──────┐
       │                                   │
       └── CalendarIntelligenceService ────┤
                                           │ propose
                                           ▼
                                  pending_actions
                                           │
                                           │ push notification
                                           ▼
                                  Operator (mobile app)
                                           │
                                     approve / dismiss
                                           │ approve
                                           ▼
                               POST /ai/actions/execute
                                           │
                                           ├── writes to goals/tasks DB
                                           └── writes to action_log
```

---

## What V3 Architectural Decisions Preserve

1. **The `_STUB` pattern is preserved.** Real API calls are still gated by flags; the architecture works in stub mode for development and demos without real Google credentials.

2. **Single-database architecture.** All V3 tables (jobs, pending actions, alerts, push tokens) live in the existing PostgreSQL instance. No new data stores.

3. **The AI provider abstraction is preserved.** `MockAIProvider` handles all new V3 AI calls (email classification, calendar analysis, daily plan) in the same way it handles existing briefing/chat/plan calls. Real calls are activated by `AI_PROVIDER=openai`.

4. **No message broker in V3.1–V3.7.** APScheduler with PostgreSQL job store covers V3's job volume. Celery + Redis is explicitly flagged as the V4 upgrade path when per-user job isolation or horizontal scale is needed.

5. **V1 and V2 endpoints unchanged.** All existing endpoints continue to work identically. No breaking API changes in V3.
