# HELIOS — Architecture Overview

Technical deep-dive for engineers reviewing the codebase. Covers system topology, data model, state management, AI abstraction, security, and configuration.

---

## System Topology

```
┌────────────────────────────────────────────────────────────┐
│                    HELIOS iOS App                          │
│  Expo SDK 55 / React Native 0.83 / TypeScript strict       │
│                                                            │
│  Expo Router (file-based)                                  │
│  src/app/                                                  │
│    (auth)/login.tsx   ──► JWT obtained                     │
│    (auth)/signup.tsx  ──► user created + JWT               │
│    (tabs)/index.tsx         Home / Dashboard               │
│    (tabs)/analytics.tsx     Live metrics                   │
│    (tabs)/agents.tsx        Agent profiles + AI planner    │
│    (tabs)/assistant.tsx     Conversational AI              │
│    (tabs)/goals.tsx         Goals CRUD                     │
│    (tabs)/tasks.tsx         Tasks CRUD                     │
│    (tabs)/profile.tsx       Settings, reminders, account   │
│                                                            │
│  Zustand (11 stores)                                       │
│  ├── useAuthStore      persisted to AsyncStorage           │
│  ├── useSettingsStore  persisted to AsyncStorage           │
│  └── 9 in-memory stores (reset on logout)                 │
│                                                            │
│  13 service modules → shared apiClient                     │
│  apiClient: fetch + AbortController(15s) + JWT header      │
└──────────────────────────────┬─────────────────────────────┘
                               │  Bearer <JWT>  (HTTPS in prod)
                               ▼
┌────────────────────────────────────────────────────────────┐
│                FastAPI Backend (Python 3.12)               │
│                                                            │
│  app/main.py — CORS middleware, exception handlers,        │
│                startup JWT-secret health check             │
│                                                            │
│  Routers (one file per resource):                          │
│  ├── /auth         signup, login, me                       │
│  ├── /goals        CRUD, user-scoped                       │
│  ├── /tasks        CRUD, user-scoped, FK ownership check   │
│  ├── /analytics    live aggregation                        │
│  ├── /dashboard    pre-built metric tiles                  │
│  ├── /agents       static agent profiles (auth-gated)      │
│  ├── /ai           briefing, plan, chat, execute actions   │
│  ├── /ai/conversations  persistent conversation history    │
│  ├── /reminders    CRUD, user-scoped, FK ownership check   │
│  ├── /settings     preferences get-or-create + patch       │
│  └── /health       health + version (no auth)              │
│                                                            │
│  Dependency: get_current_user (every protected route)      │
│    1. Extract Bearer token from Authorization header       │
│    2. Decode JWT — verify signature, expiry, type claim    │
│    3. Load User from DB — 401 if not found                 │
│                                                            │
│  AI layer (app/ai/):                                       │
│  ├── base.py            AIProvider abstract base class     │
│  ├── factory.py         reads AI_PROVIDER, returns impl    │
│  ├── mock_provider.py   deterministic dev responses        │
│  ├── openai_provider.py complete OpenAI implementation     │
│  ├── prompts.py         prompt templates                   │
│  └── context_builder.py injects live goals/tasks into AI  │
│                                                            │
│  Intelligence layer:                                      │
│  ├── services/awareness_engine.py                         │
│  │   shared real-time time/weather/calendar/task/goal      │
│  │   context. See docs/v3-real-time-awareness-engine.md.   │
│  └── services/priority_engine.py                          │
│      shared Daily Brief, Today's Flow, Next Best Action,   │
│      Build My Day, assistant recommendation, and email     │
│      filtering engine. See docs/v3-priority-engine.md.     │
│                                                            │
│  Future context providers:                                │
│  └── Financial Services architecture is documented in      │
│      docs/v4-v5-financial-services-architecture.md.        │
└──────────────────────────────┬─────────────────────────────┘
                               │  SQLAlchemy / psycopg2
                               ▼
┌────────────────────────────────────────────────────────────┐
│               PostgreSQL 16 (Docker managed volume)        │
│                                                            │
│  Schema managed by Alembic (6 migrations)                  │
│  Migration chain: 001 → 002 → 003 → 004 → 005 → 006       │
└────────────────────────────────────────────────────────────┘
```

---

## Data Model

```
users
  id              TEXT PRIMARY KEY          (UUID string)
  name            VARCHAR(100) NOT NULL
  email           VARCHAR(255) UNIQUE INDEX
  hashed_password VARCHAR(255)              (bcrypt, never in API response)
  created_at      TIMESTAMPTZ

goals
  id              TEXT PRIMARY KEY
  user_id         TEXT → users ON DELETE CASCADE   INDEX
  title           VARCHAR(200)
  description     TEXT
  status          TEXT  "active" | "completed" | "paused"
  target_date     TEXT  (ISO 8601 date string, nullable)
  created_at / updated_at  TIMESTAMPTZ

tasks
  id              TEXT PRIMARY KEY
  user_id         TEXT → users ON DELETE CASCADE   INDEX
  linked_goal_id  TEXT → goals ON DELETE SET NULL  (nullable)
  title           VARCHAR(200)
  description     TEXT
  status          TEXT  "todo" | "in_progress" | "done"
  priority        TEXT  "low" | "medium" | "high" | "critical"
  due_date        TEXT  (ISO 8601, nullable)
  created_at / updated_at  TIMESTAMPTZ

conversations
  id              TEXT PRIMARY KEY
  user_id         TEXT → users ON DELETE CASCADE   INDEX
  title           VARCHAR(200)
  created_at / updated_at  TIMESTAMPTZ

conversation_messages
  id              TEXT PRIMARY KEY
  conversation_id TEXT → conversations ON DELETE CASCADE   INDEX
  user_id         TEXT → users ON DELETE CASCADE
  role            TEXT  "user" | "assistant"
  content         TEXT
  meta            TEXT  (JSON: suggested_actions, follow_up_questions, recommended_actions, provider)
  created_at      TIMESTAMPTZ

reminders
  id              TEXT PRIMARY KEY
  user_id         TEXT → users ON DELETE CASCADE   INDEX
  task_id         TEXT → tasks ON DELETE SET NULL  (nullable)
  goal_id         TEXT → goals ON DELETE SET NULL  (nullable)
  title           VARCHAR(200)
  body            VARCHAR(500)  (nullable)
  remind_at       TEXT  (ISO 8601 datetime string)
  is_enabled      BOOLEAN
  created_at / updated_at  TIMESTAMPTZ

user_preferences
  user_id             TEXT PRIMARY KEY → users ON DELETE CASCADE   (1-to-1)
  theme_preference    VARCHAR(20)  "system" | "dark" | "light"
  notifications_enabled  BOOLEAN
  reminder_notifications BOOLEAN
  ai_notifications       BOOLEAN
  default_planning_horizon  INTEGER  (days, 1–90)
  updated_at          TIMESTAMPTZ
```

**Notable design choices:**
- All PKs are UUID strings generated at the application layer — no serial IDs.
- `remind_at` and date fields are stored as ISO 8601 strings rather than `TIMESTAMPTZ` columns, consistent with the date convention used for `due_date` and `target_date`. This simplifies serialisation without affecting correctness for the current scope.
- `user_preferences` uses `user_id` as both PK and FK — a 1-to-1 table rather than adding columns to `users`, keeping the user model lean.
- `conversation_messages.meta` stores JSON as a TEXT column. This avoids a JSONB migration while keeping the schema evolvable — the application layer always parses with a fallback.

---

## Mobile Architecture

### Expo Router (file-based navigation)

Routes are defined by file path under `src/app/`. Groups control layout:
- `(auth)/` — stack navigator with no auth guard; accessible when unauthenticated
- `(tabs)/` — tab bar navigator with double auth guard (root `_layout.tsx` is primary, `(tabs)/_layout.tsx` catches edge cases like deep links)

The root `_layout.tsx` waits for Zustand's AsyncStorage hydration to complete before rendering any route. This is the hydration guard — it prevents the flash-to-login that occurs when the route renders before the persisted token is available.

```
_layout.tsx startup sequence:
  1. Mount → subscribe to store.persist.onFinishHydration
  2. Hydration complete → call revalidate() (hits /auth/me)
  3. Token valid → stay on (tabs); Token expired/absent → redirect to (auth)/login
  4. Render routes
```

### Zustand Store Pattern

Each store owns: data, `isLoading`, `isMutating` (for write operations), `error`, and a `reset()` action.

```typescript
// Standard store shape
type GoalsState = {
  goals: Goal[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchGoals: (token: string) => Promise<void>;
  createGoal: (token: string, data: GoalCreate) => Promise<void>;
  updateGoal: (token: string, id: string, data: GoalUpdate) => Promise<void>;
  deleteGoal: (token: string, id: string) => Promise<void>;
  reset: () => void;
};
```

**Persistence decisions:**
- `useAuthStore` — persisted (user + accessToken only; isLoading and error are excluded via `partialize`)
- `useSettingsStore` — persisted (preferences available instantly on cold start before network call)
- All other stores — in-memory only; data fetched fresh on each screen mount

**Logout sequence:**
```
useAuthStore.logout()
  → useGoalsStore.reset()
  → useTasksStore.reset()
  → useAnalyticsStore.reset()
  → useAIStore.reset()
  → useDashboardStore.reset()
  → useAgentsStore.reset()
  → useSettingsStore.reset()
  → set({ user: null, accessToken: null })
```

### Service Layer

Each service module is a thin object wrapping `apiClient`:

```typescript
export const goalsService = {
  list:   (token: string) => apiClient.get<GoalsResponse>(BASE, token),
  create: (token: string, body: GoalCreate) => apiClient.post<GoalOut>(BASE, body, token),
  update: (token: string, id: string, body: GoalUpdate) => apiClient.patch<GoalOut>(`${BASE}/${id}`, body, token),
  delete: (token: string, id: string) => apiClient.del(`${BASE}/${id}`, token),
};
```

`apiClient` handles: `Authorization: Bearer` header, 15-second `AbortController` timeout, FastAPI error parsing (both `"detail": "string"` and `"detail": [...]` array formats), and network error normalisation.

---

## Backend Architecture

### Router Design

Every router follows the same pattern:
1. FastAPI route function with `Depends(get_current_user)` and `Depends(get_db)`
2. Optional FK ownership validation before any writes
3. SQLAlchemy query always filtered by `WHERE user_id = current_user.id`
4. Pydantic schema for both input validation and response serialisation

```python
@router.patch("/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: str,
    payload: GoalUpdate,
    current_user: User = Depends(get_current_user),   # auth
    db: Session = Depends(get_db),
) -> GoalOut:
    goal = db.execute(
        select(Goal).where(
            Goal.id == goal_id,
            Goal.user_id == current_user.id,           # ownership
        )
    ).scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found.")
    ...
```

### AI Provider Pattern

```python
# base.py
class AIProvider(ABC):
    @abstractmethod
    def generate_briefing(self, user_name: str, user_context: str) -> DailyBriefing: ...
    @abstractmethod
    def generate_plan(self, prompt: str, horizon: int, goal_title: str | None, user_name: str) -> PlanResponse: ...
    @abstractmethod
    def generate_chat_reply(self, message: str, user_name: str, context_type: str | None, user_context: str | None) -> ChatResponse: ...

# factory.py — validates OPENAI_API_KEY before instantiating
def get_ai_provider() -> AIProvider:
    if settings.ai_provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("AI_PROVIDER=openai requires OPENAI_API_KEY")
        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)
    return MockAIProvider()
```

Switching providers: set `AI_PROVIDER=openai` and `OPENAI_API_KEY=<OPENAI_API_KEY>` in `.env`. No router code changes needed. `OpenAIProvider` is a complete implementation — briefing, plan, and chat all map to real `chat.completions.create` calls with JSON response format. All OpenAI error types (`AuthenticationError`, `RateLimitError`, `APIConnectionError`, `APIStatusError`) are caught and re-raised as `RuntimeError` with user-friendly messages, which the router converts to `502 Bad Gateway`.

**Context builder** (`context_builder.py`) queries the authenticated user's goals and tasks and formats them as a structured string injected into the AI prompt when `include_context=True` is passed by the client.

### Database Session

```python
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # revalidates connections before use
    pool_size=5,
    max_overflow=0,
)
```

`pool_pre_ping=True` prevents "connection reset" errors from long-idle development sessions.

---

## Configuration

```
backend/.env  (git-ignored)
  DATABASE_URL      → PostgreSQL connection string
  JWT_SECRET_KEY    → HS256 signing key (minimum 16 chars; startup warns if placeholder)
  DEBUG             → false in production
  CORS_ORIGINS      → comma-separated origins ("*" safe for mobile-only API)
  AI_PROVIDER       → "mock" or "openai"
  OPENAI_API_KEY    → required when AI_PROVIDER=openai
  OPENAI_MODEL      → "gpt-4o-mini" default

mobile/.env  (optional, git-ignored)
  EXPO_PUBLIC_API_URL  → production API base URL
                         injected at EAS Build time; ignored in local dev (__DEV__ === true)
```

---

## Security Model

See [README security section](../README.md#security) for the Phase 37 audit findings. Key points:

- `hashed_password` never appears in any Pydantic response model
- JWT tokens use HS256 with an explicit algorithm allowlist (prevents algorithm confusion attacks)
- JWT payload includes a `"type": "access"` claim (prevents token type confusion)
- Login returns identical 401 for both "not found" and "wrong password" (timing-safe via bcrypt)
- Every API query filters by `current_user.id` — cross-user access is not possible at the ORM layer
- Optional FK fields validated against `current_user.id` before being stored
- `DEBUG=false` by default — stack traces are never returned to clients in production

---

## Local Development

```bash
# Backend (Docker)
cd backend && cp .env.example .env
# Set JWT_SECRET_KEY in .env
docker compose up --build    # starts api (8000) + db (5432)

# Mobile (Expo)
cd mobile && npm install
npx expo start               # press 'i' for iOS Simulator

# API docs
open http://localhost:8000/docs    # Swagger UI
open http://localhost:8000/redoc   # ReDoc
```

---

## Production Deployment

See [docs/deployment.md](deployment.md) for full instructions covering Render, Railway, and Fly.io for the backend, Supabase/Neon for PostgreSQL, and EAS Build for iOS.
