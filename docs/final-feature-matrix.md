# HELIOS — Final Feature Matrix (V1 + V2 + V3)

**Verified:** 2026-06-12 | **Audit:** V3.14 | **Status:** Complete

All entries reflect features verified against live running backend (Docker) and TypeScript-checked mobile source. Routes were exercised via `curl` against `http://localhost:8000`. Mobile TypeScript check (strict mode): 0 errors.

---

## Authentication

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Signup (name + email + password) | `POST /auth/signup` | `(auth)/signup.tsx` | ✅ Real |
| Login (email + password) | `POST /auth/login` | `(auth)/login.tsx` | ✅ Real |
| Session validation | `GET /auth/me` | `_layout.tsx` hydration | ✅ Real |
| Persistent login | — | AsyncStorage token | ✅ Real |
| Account deletion | `DELETE /auth/account` | `authService.ts` | ✅ Real |
| Logout (all stores wiped) | — | `useAuthStore.logout()` | ✅ Real |
| Rate limiting (signup 5/min, login 10/min) | slowapi decorators | — | ✅ Real |
| JWT algorithm allowlist | `algorithms=["HS256"]` | — | ✅ Real |
| JWT type claim (prevents token confusion) | `"type":"access"` payload | — | ✅ Real |
| Timing-safe login (identical 401) | bcrypt constant-time | — | ✅ Real |

---

## Goals

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create, list, update, delete goals | `GET/POST/PATCH/DELETE /goals` | `goals.tsx` | ✅ Real |
| Goal status: active / completed / paused | Model constraint | `useGoalsStore` | ✅ Real |
| Optional target date | `target_date` field | Goals form | ✅ Real |
| Ownership enforcement | `WHERE user_id = current_user.id` | — | ✅ Real |

---

## Tasks

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create, list, update, delete tasks | `GET/POST/PATCH/DELETE /tasks` | `tasks.tsx` | ✅ Real |
| Priority: low / medium / high / critical | Model field | Task form | ✅ Real |
| Status: todo / in_progress / done | Model field | `useTasksStore` | ✅ Real |
| Link task to goal (optional FK) | `linked_goal_id` | Task form | ✅ Real |

---

## Analytics

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Summary: completion rate, active goals, open tasks | `GET /analytics/summary` | `analytics.tsx` | ✅ Real |

---

## Reminders

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create, list, update, delete reminders | `GET/POST/PATCH/DELETE /reminders` | `useRemindersStore` | ✅ Real |

---

## Settings / Preferences

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Get and update user preferences | `GET/PATCH /settings/preferences` | `useSettingsStore` | ✅ Real |

---

## AI — Core

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Daily briefing (context-aware) | `GET /ai/briefing/daily` | `BriefingCard` | ✅ Real (mock provider) |
| AI chat with context injection | `POST /ai/chat` | `assistant.tsx` | ✅ Real (mock provider) |
| AI execution plan generation | `POST /ai/plan` | `PlanCard` | ✅ Real (mock provider) |
| Structured action execute | `POST /ai/actions/execute` | `ActionReviewModal` | ✅ Real |
| OpenAI provider (live GPT) | `openai_provider.py` | — | ✅ Real (requires OPENAI_API_KEY) |
| Mock provider (offline, deterministic) | `mock_provider.py` | — | ✅ Real |

---

## AI Memory (V2)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create, list, delete memory entries | `GET/POST/DELETE /ai/memory` | `memory.tsx` | ✅ Real |
| Memory types: preference, important_fact, goal_context, recurring_interest | `memory_type` field | Memory form | ✅ Real |
| 200-entry soft cap | Server-side enforcement | — | ✅ Real |
| Memory injected into all AI prompts | `build_context()` LONG-TERM MEMORY section | — | ✅ Real |

---

## Conversations (V2)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create, list, load, delete conversations | `GET/POST/DELETE /ai/conversations` | `useConversationStore` | ✅ Real |
| Conversation messages | `GET /ai/conversations/{id}/messages` | Assistant screen | ✅ Real |
| Conversation history modal | — | `assistant.tsx` | ✅ Real |

---

## Unified Context Engine (V2)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Context scopes: DAILY_BRIEFING, PLANNING, AGENT, CHAT, CALENDAR_SYNC, EMAIL_SYNC | `ContextScope` enum | — | ✅ Real |
| Live data composition per scope (goals, tasks, memories, calendar, email) | `build_context()` | — | ✅ Real |
| Agent-domain-filtered context packages | `AgentContextPackage` | Agent context preview | ✅ Real |

---

## Agents + Orchestration (V2 + V3.11)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| 5 specialist agents (Strategy, Finance, Health, Study, Career) | `GET /agents` | `agents.tsx` | ✅ Real |
| Per-agent context | `GET /agents/{id}/context` | `AgentContextPreview` | ✅ Real |
| Multi-agent orchestration | `POST /agents/orchestrate` | Agents screen | ✅ Real (mock provider) |
| Coordinated plan output | `coordinated_plan` field | `OrchestrationResultCard` | ✅ Real |
| Agent consensus summary | `consensus_summary` field | Consensus panel | ✅ Real |
| Divergent views / disagreements | `disagreements` list | Consensus panel | ✅ Real |
| Overall confidence (0.0–1.0) | `overall_confidence` field | Confidence badge | ✅ Real |

---

## Google Integration Architecture (V2)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Integration list (4 providers) | `GET /integrations` | `integrations.tsx` | ✅ Real |
| Mock connect (simulate connected state) | `POST /integrations/mock-connect` | Integrations screen | ✅ Real |
| Disconnect integration | `DELETE /integrations/{id}` | Integrations screen | ✅ Real |
| Trigger sync | `POST /integrations/{id}/sync` | Integrations screen | ✅ Simulated |
| Sync status | `GET /integrations/sync/status` | Integrations screen | ✅ Real |
| Google OAuth connect-URL | `GET /integrations/google/connect-url` | — | ✅ Stub (requires credentials) |
| Google OAuth code exchange | `POST /integrations/google/exchange` | — | ✅ Stub (STUB_EXCHANGE=True) |
| OAuth token encryption at rest | Fernet AES-128-CBC | — | ✅ Real (requires TOKEN_ENCRYPTION_KEY) |
| Google Calendar adapter | `google_calendar_adapter.py` | — | ✅ Stub (_STUB=True) |
| Gmail adapter | `gmail_adapter.py` | — | ✅ Stub (_STUB=True) |
| Sync simulator (fixture data) | `sync_simulator.py` | Calendar + Email screens | ✅ Simulated |

---

## Calendar (V2)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| List calendar events | `GET /calendar/events` | `calendar.tsx` | ✅ Real (populated by sync simulator) |
| Create, update, delete events | `POST/PATCH/DELETE /calendar/events/{id}` | Calendar screen | ✅ Real |
| Calendar data in AI context | `build_context()` CALENDAR section | Briefing, plan, chat | ✅ Real |

---

## Email (V2)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| List email messages | `GET /email/messages` | `email.tsx` | ✅ Real (populated by sync simulator) |
| Create, update email records | `POST/PATCH /email/messages/{id}` | Email screen | ✅ Real |
| Email data in AI briefing | `build_context()` EMAIL section | Briefing | ✅ Real |

---

## Autonomy Queue (V3)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create queue item | `POST /autonomy/queue` | Command Center | ✅ Real |
| List queue (filter by status) | `GET /autonomy/queue` | Command Center | ✅ Real |
| Approve / reject item | `PATCH /autonomy/queue/{id}` | Queue cards | ✅ Real |
| Delete item | `DELETE /autonomy/queue/{id}` | Queue cards | ✅ Real |
| Execute approved item | `POST /autonomy/queue/{id}/execute` | Queue cards | ✅ Real |
| Execution: create_task | Execution bridge | Queue execute | ✅ Real |
| Execution: create_goal | Execution bridge | Queue execute | ✅ Real |
| Execution: update_task_status | Execution bridge | Queue execute | ✅ Real |
| Execution: generate_plan | Execution bridge | Queue execute | ✅ Real |
| Reject all other action types | `_SAFE_AUTONOMY_ACTIONS` check | — | ✅ Real |

---

## Proactive Suggestions + Daily Plan (V3)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Generate suggestions (ephemeral) | `GET /autonomy/suggestions` | Suggestions section | ✅ Real (mock provider) |
| Promote suggestion to queue | `POST /autonomy/queue` | "Add to Queue" button | ✅ Real |
| Generate daily plan | `POST /autonomy/daily-plan` | Daily Plan section | ✅ Real (mock provider) |
| Promote plan item to queue | `POST /autonomy/queue` | Plan "Add to Queue" | ✅ Real |

---

## Approval Rules (V3)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create, list, update, delete rules | `GET/POST/PATCH/DELETE /autonomy/rules` | Rules section | ✅ Real |
| Wildcard rules (risk_level=None) | Application-level check | Rule form | ✅ Real |
| Blocking rule enforcement at execute time | Pre-execute check → 403 | — | ✅ Real |
| Duplicate rule prevention | Application-level uniqueness check | — | ✅ Real |

---

## Audit Log (V3)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| List audit log with pagination | `GET /autonomy/audit-log` | Audit Log section | ✅ Real |
| 7 event types recorded | `_record_audit()` helper | Audit log entries | ✅ Real |
| Immutable (no update/delete endpoints) | No endpoints exist | — | ✅ Real |

---

## Notifications (V3)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| List notifications + unread count | `GET /notifications` | Inbox screen | ✅ Real |
| Mark notification read | `PATCH /notifications/{id}/read` | Inbox screen | ✅ Real |
| Mark all read | `PATCH /notifications/read-all` | Inbox screen | ✅ Real |
| Delete notification | `DELETE /notifications/{id}` | Inbox screen | ✅ Real |
| Tab bar badge (unread count) | — | `_layout.tsx` tabBarBadge | ✅ Real |
| Notifications emitted by autonomy events | `_emit_notification()` in autonomy.py | — | ✅ Real |
| Notifications emitted by job triggers | `_emit()` in background_jobs.py | — | ✅ Real |

---

## Background Jobs (V3)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Create, list, update, delete jobs | `GET/POST/PATCH/DELETE /background-jobs` | Profile → Background Jobs | ✅ Real |
| One job per type per user enforcement | Application-level check | — | ✅ Real |
| Enable/disable toggle | `enabled` field + PATCH | Profile screen | ✅ Real |
| Trigger job manually | `POST /background-jobs/{id}/trigger` | Profile + Command Center RUN | ✅ Real |
| daily_briefing_generation trigger | Handler generates briefing, emits notification | RUN button | ✅ Real |
| proactive_suggestion_scan trigger | Handler queues suggestions as pending items | RUN button | ✅ Real |
| reminder_check trigger | Handler counts reminders, notifies | RUN button | ✅ Real |
| integration_sync_simulation trigger | Handler records simulated sync | RUN button | ✅ Real |
| Job status transitions (idle → running → idle) | trigger endpoint | — | ✅ Real |
| Job status: failed (on AI RuntimeError) | RuntimeError → status=failed, 502 | — | ✅ Real |
| Automatic scheduled execution | — | — | ❌ Deferred (no worker) |

---

## Command Center (V3)

| Feature | Backend | Mobile | Status |
|---------|---------|--------|--------|
| Command Center hero (HELIOS V3 / Command Center) | — | `autonomy.tsx` | ✅ Real |
| Status row: PENDING / APPROVED / INBOX / JOBS | — | Status row component | ✅ Real |
| INBOX accent highlight when non-zero | — | `unreadCount` conditional style | ✅ Real |
| Scheduled Jobs panel with RUN buttons | `/trigger` endpoint | bgJobs panel | ✅ Real |
| Pull-to-refresh (all sections) | — | RefreshControl | ✅ Real |

---

## Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Docker Compose (api + postgres) | ✅ Ready | `docker compose up` |
| PostgreSQL 16 with healthcheck | ✅ Ready | Volume-backed persistence |
| Alembic migrations (001–017) | ✅ Ready | All applied on clean DB |
| SQLAlchemy 2.0 ORM | ✅ Real | Parameterized queries only |
| Pydantic v2 request validation | ✅ Real | All API boundaries |
| slowapi rate limiting | ✅ Real | Auth routes protected |
| CORS middleware | ✅ Real | Configurable via CORS_ORIGINS |
| Request logging middleware with request IDs | ✅ Real | Structured JSON logging |
| SQLAlchemy error handler (503) | ✅ Real | Generic + specific handlers |
| Weak-secret startup warning | ✅ Real | Warns on dev placeholder JWT |
| Expo Router (v55) tab navigation | ✅ Real | 12 tabs, Inbox badge |
| Zustand state management | ✅ Real | 17 stores |
| TypeScript strict mode | ✅ Passing | 0 errors |
