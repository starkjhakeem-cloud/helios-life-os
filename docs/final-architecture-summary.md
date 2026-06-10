# HELIOS — Final Architecture Summary (V1)

**Verified:** 2026-06-10 | **Phase:** 50

Concise reference for reviewers. Full detail is in [architecture-overview.md](architecture-overview.md).

---

## System Topology

```
┌─────────────────────────────────────────────────────────────┐
│                 HELIOS iOS App                              │
│        Expo SDK 55 / React Native 0.83 / TypeScript strict  │
│                                                             │
│  (auth) group             (tabs) group — 7 screens          │
│  login.tsx  ────────►  Home · Analytics · Agents            │
│  signup.tsx             Assistant · Goals · Tasks · Profile  │
│                                │                            │
│            Zustand — 11 stores                              │
│              useAuthStore      ← persisted (AsyncStorage)   │
│              useSettingsStore  ← persisted (AsyncStorage)   │
│              9 in-memory stores ← reset on logout           │
│                                │                            │
│   apiClient: fetch + AbortController(15s) + Bearer <JWT>    │
└────────────────────────────────┼────────────────────────────┘
                                 │  HTTP (local) / HTTPS (prod)
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│             FastAPI Backend (Python 3.12)                   │
│                                                             │
│  Middleware: CORS · RequestLogging · RateLimiter (slowapi)  │
│  Exception handlers: SQLAlchemyError → 503, generic → 500   │
│                                                             │
│  Routers (11 modules, one file per resource):               │
│    /auth         signup · login · me · DELETE account       │
│    /goals        CRUD — user-scoped                         │
│    /tasks        CRUD — user-scoped + FK ownership check    │
│    /analytics    live SQL aggregation per request           │
│    /dashboard    metric tiles + AI insight                  │
│    /agents       5 static profiles (auth-gated)             │
│    /ai           briefing · plan · chat · execute           │
│    /ai/conversations  persistent chat history               │
│    /reminders    CRUD — user-scoped + FK ownership check    │
│    /settings     preferences GET-or-create + PATCH          │
│    /health       health · version · diagnostics (no auth)   │
│                                                             │
│  Auth dependency: get_current_user (all protected routes)   │
│    1. Extract Bearer token from Authorization header        │
│    2. Decode JWT — verify sig + expiry + type claim         │
│    3. Load user from DB — 401 if not found                  │
│                                                             │
│  AI layer (app/ai/):                                        │
│    AIProvider (ABC) ─── MockAIProvider  ← default           │
│                     └── OpenAIProvider  ← set AI_PROVIDER   │
│    context_builder: injects live user goals + tasks         │
│    factory: validates OPENAI_API_KEY before instantiating   │
└────────────────────────────────┼────────────────────────────┘
                                 │  SQLAlchemy 2.0 / psycopg2
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│             PostgreSQL 16 (Docker managed volume)           │
│                                                             │
│  7 tables — 6 Alembic migrations (001 → 006)               │
│                                                             │
│  users ──< goals ──< tasks (linked_goal_id → goals SET NULL)│
│        ──< conversations ──< conversation_messages          │
│        ──< reminders                                        │
│        ──  user_preferences  (1-to-1, user_id as PK)        │
│                                                             │
│  All PKs: UUID strings (application-generated)             │
│  FKs: CASCADE (user → children) or SET NULL (task → goal)   │
│  Unique: users.email (lowercase-normalised before write)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model Summary

| Table | PK | Key Columns | FK Relationships |
|---|---|---|---|
| `users` | `id` (UUID) | name, email (unique), hashed_password, created_at | — |
| `goals` | `id` (UUID) | user_id, title, description, status, target_date | `user_id → users CASCADE` |
| `tasks` | `id` (UUID) | user_id, linked_goal_id, title, status, priority, due_date | `user_id → users CASCADE`; `linked_goal_id → goals SET NULL` |
| `conversations` | `id` (UUID) | user_id, title, created_at, updated_at | `user_id → users CASCADE` |
| `conversation_messages` | `id` (UUID) | conversation_id, user_id, role, content, meta (JSON as TEXT) | `conversation_id → conversations CASCADE` |
| `reminders` | `id` (UUID) | user_id, task_id, goal_id, title, body, remind_at, is_enabled | `user_id → users CASCADE`; optional task/goal FKs SET NULL |
| `user_preferences` | `user_id` (FK = PK) | theme_preference, notifications_enabled, default_planning_horizon | `user_id → users CASCADE` |

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Primary keys | UUID strings at app layer | No auto-increment leakage; works across DB engines |
| Date storage | ISO 8601 strings | Consistent with mobile serialization; avoids tz-conversion complexity |
| Conversation message metadata | JSON as TEXT column | Avoids JSONB migration; app layer parses with fallback |
| Preferences table | Separate table (not columns on users) | Keeps user model lean; get-or-create pattern |
| AI provider | Abstract base class + factory | Zero-code provider swap via environment variable |
| AsyncStorage persistence | Auth + settings only | Prevents stale data across user sessions on shared devices |
| Test database | SQLite (via env var override) | No PostgreSQL required to run tests locally |
| CORS credentials | `allow_credentials=False` | Auth via Bearer header, not cookies |

---

## Security Model

| Layer | Mechanism |
|---|---|
| Password storage | bcrypt (random salt, default work factor 12) |
| JWT signing | HS256 with explicit algorithm allowlist |
| JWT type claim | `"type": "access"` checked — prevents token type confusion |
| Login response | Identical 401 for unknown email and wrong password |
| Per-request auth | `Depends(get_current_user)` on every protected route |
| Data isolation | Every query filtered by `WHERE user_id = current_user.id` |
| FK ownership | `linked_goal_id`, `task_id`, `goal_id` validated against `current_user.id` before write |
| Secrets management | `JWT_SECRET_KEY` never committed; startup warning if placeholder detected |
| Input validation | Pydantic `Literal` types for enums; `min_length`/`max_length` on all string fields |

---

## Mobile State Architecture

```
useAuthStore (persisted)
  accessToken, user
  login() → set token + user
  logout() → reset all 9 data stores, then clear token/user
  revalidate() → call /auth/me on cold start; clear on 401

useSettingsStore (persisted)
  preferences (theme, planning_horizon, notifications)
  updatePreferences() → optimistic update → PATCH API → re-fetch on error

9 in-memory stores (reset on logout)
  useGoalsStore, useTasksStore, useAnalyticsStore,
  useAIStore, useDashboardStore, useAgentsStore,
  useConversationStore, useRemindersStore, useAppStore
  Each owns: data, isLoading, isMutating, error, reset()
```

---

## Request Lifecycle

```
Mobile app
  → apiClient.get/post/patch/del
    → fetch(url, { headers: { Authorization: Bearer <token> }, signal: AbortController(15s) })
      → FastAPI route
        → RequestLoggingMiddleware (log request start)
        → RateLimiter (check limit)
        → CORS middleware
        → route handler
          → get_current_user(credentials, db)
            → decode JWT (verify sig, expiry, type)
            → SELECT user WHERE id = sub
          → business logic + SQL query (WHERE user_id = current_user.id)
          → Pydantic response model serialisation
        → RequestLoggingMiddleware (log method, path, status, duration)
      ← JSON response
    ← parse body or throw ApiError
  ← typed result
```

---

## Deployment Configuration

| Environment | Backend URL | Database | AI Provider |
|---|---|---|---|
| Local dev | `http://localhost:8000` | Docker PostgreSQL 16 | `mock` (default) |
| Local dev (OpenAI) | `http://localhost:8000` | Docker PostgreSQL 16 | `openai` (set env vars) |
| Production | HTTPS via TLS-terminating proxy | Managed PostgreSQL (Render/Railway/Neon) | `mock` or `openai` |
| iOS dev build | `http://localhost:8000` (or machine IP) | — | — |
| iOS production build | `EXPO_PUBLIC_API_URL` (EAS env) | — | — |
