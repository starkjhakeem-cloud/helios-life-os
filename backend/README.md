# HELIOS Backend

FastAPI REST API for the HELIOS iOS application. Provides JWT authentication, PostgreSQL-backed CRUD for goals and tasks, real-time analytics, and an AI provider layer.

---

## Quick Start

```bash
cp .env.example .env
# Set JWT_SECRET_KEY to a strong random value:
python3 -c "import secrets; print(secrets.token_hex(32))"

docker compose up --build
```

- API: [http://localhost:8000](http://localhost:8000)
- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)

Database migrations run automatically on container startup via `alembic upgrade head`.

---

## Project Layout

```
backend/
├── app/
│   ├── ai/                     # AI provider abstraction
│   │   ├── base.py             # AIProvider abstract class
│   │   ├── factory.py          # get_ai_provider() — reads AI_PROVIDER from config
│   │   ├── mock_provider.py    # Default provider (no external API calls)
│   │   └── openai_provider.py  # Stub for future OpenAI integration
│   ├── core/
│   │   ├── jwt.py              # create_access_token / decode_access_token
│   │   └── security.py         # hash_password / verify_password (bcrypt)
│   ├── db/
│   │   ├── base.py             # SQLAlchemy DeclarativeBase
│   │   └── session.py          # SessionLocal + get_db dependency
│   ├── dependencies/
│   │   └── auth.py             # get_current_user — validates JWT, loads User
│   ├── models/
│   │   ├── user.py             # users table
│   │   ├── goal.py             # goals table (FK → users)
│   │   ├── task.py             # tasks table (FK → users, FK → goals SET NULL)
│   │   ├── conversation.py     # conversation summaries table
│   │   ├── reminder.py         # reminders table (FK → users, tasks, goals)
│   │   └── user_preferences.py # 1-to-1 preferences table (FK → users)
│   ├── routers/
│   │   ├── auth.py             # POST /signup, POST /login, GET /me
│   │   ├── dashboard.py        # GET /dashboard/summary
│   │   ├── goals.py            # GET/POST /goals, PATCH/DELETE /goals/{id}
│   │   ├── tasks.py            # GET/POST /tasks, PATCH/DELETE /tasks/{id}
│   │   ├── analytics.py        # GET /analytics/summary
│   │   ├── agents.py           # GET /agents
│   │   ├── ai.py               # GET /ai/briefing, POST /ai/plan, POST /ai/chat
│   │   ├── conversations.py    # GET /ai/conversations
│   │   ├── reminders.py        # GET/POST /reminders, PATCH/DELETE /reminders/{id}
│   │   ├── settings.py         # GET/PATCH /settings/preferences
│   │   └── health.py           # GET /health, GET /version
│   ├── schemas/
│   │   ├── auth.py             # SignupRequest, LoginRequest, AuthResponse, UserOut
│   │   ├── goals.py            # GoalCreate, GoalUpdate, GoalOut, GoalsResponse
│   │   ├── tasks.py            # TaskCreate, TaskUpdate, TaskOut, TasksResponse
│   │   ├── analytics.py        # AnalyticsSummary
│   │   ├── agents.py           # AgentProfile, AgentsResponse
│   │   ├── ai.py               # PlanRequest, PlanResponse, DailyBriefing, ChatRequest
│   │   ├── conversations.py    # ConversationSummary
│   │   ├── reminders.py        # ReminderCreate, ReminderUpdate, ReminderOut
│   │   ├── settings.py         # PreferencesOut, PreferencesUpdate
│   │   └── dashboard.py        # DashboardSummary, MetricItem, SectionItem
│   ├── config.py               # Settings — pydantic-settings, reads from .env
│   └── main.py                 # FastAPI app, CORS middleware, exception handlers
├── alembic/
│   └── versions/
│       ├── 001_initial_user_table.py
│       ├── 002_goals_table.py
│       ├── 003_tasks_table.py
│       ├── 004_conversations_table.py
│       ├── 005_reminders_table.py
│       └── 006_user_preferences_table.py
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## Environment Variables

Copy `.env.example` to `.env` before running. The `.env` file is git-ignored.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://helios:helios@localhost:5432/helios` | PostgreSQL connection string — docker-compose sets the `db` hostname automatically |
| `JWT_SECRET_KEY` | **Yes** | placeholder | HS256 signing key — generate with `secrets.token_hex(32)` |
| `JWT_ALGORITHM` | No | `HS256` | JWT algorithm |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | Token lifetime |
| `DEBUG` | No | `false` | Re-raises unhandled exceptions in dev instead of returning 500 |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins — `*` is safe for mobile-only APIs |
| `AI_PROVIDER` | No | `mock` | `mock` for deterministic responses or `openai` for GPT |
| `OPENAI_API_KEY` | Conditional | — | Required when `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model to use with the OpenAI provider |

---

## Database Schema

Three tables, applied in order by Alembic:

```
users
  id            TEXT PRIMARY KEY      (UUID string)
  name          VARCHAR(100) NOT NULL
  email         VARCHAR(255) UNIQUE NOT NULL, INDEX
  hashed_password VARCHAR(255) NOT NULL
  created_at    TIMESTAMPTZ NOT NULL

goals
  id            TEXT PRIMARY KEY
  user_id       TEXT NOT NULL → users.id ON DELETE CASCADE
  title         VARCHAR(200) NOT NULL
  description   TEXT
  status        TEXT NOT NULL DEFAULT 'active'
  target_date   TEXT
  created_at    TIMESTAMPTZ NOT NULL
  updated_at    TIMESTAMPTZ NOT NULL
  INDEX: ix_goals_user_id

tasks
  id            TEXT PRIMARY KEY
  user_id       TEXT NOT NULL → users.id ON DELETE CASCADE
  linked_goal_id TEXT → goals.id ON DELETE SET NULL
  title         VARCHAR(200) NOT NULL
  description   TEXT
  status        TEXT NOT NULL DEFAULT 'todo'
  priority      TEXT NOT NULL DEFAULT 'medium'
  due_date      TEXT
  created_at    TIMESTAMPTZ NOT NULL
  updated_at    TIMESTAMPTZ NOT NULL
  INDEX: ix_tasks_user_id
```

All user-specific queries filter by `user_id = current_user.id` — cross-user data access is not possible at the ORM layer.

---

## Authentication Flow

```
POST /auth/signup  →  hash password (bcrypt)  →  insert user  →  return JWT + UserOut
POST /auth/login   →  lookup by email  →  bcrypt.verify  →  return JWT + UserOut
GET  /auth/me      →  decode JWT  →  load user from DB  →  return UserOut
```

Every protected route uses `Depends(get_current_user)`:
1. Extracts `Authorization: Bearer <token>` header (returns 401 if absent)
2. Decodes and validates the JWT — checks signature, expiry, and `"type": "access"` claim
3. Loads the user row from PostgreSQL — returns 401 if not found
4. Returns the `User` ORM instance to the route handler

---

## AI Provider Layer

Routes in `routers/ai.py` call `get_ai_provider()` from `ai/factory.py`. The factory reads `settings.ai_provider` and returns the appropriate provider instance.

```python
# Switching providers requires only a config change — no router changes.
AI_PROVIDER=mock    # MockAIProvider — deterministic, no external calls
AI_PROVIDER=openai  # OpenAIProvider — requires OPENAI_API_KEY + pip install openai
```

To implement the OpenAI provider, add logic to `app/ai/openai_provider.py`. The abstract interface requires:
- `generate_briefing(user_name: str) -> DailyBriefing`
- `generate_plan(prompt, horizon, goal_title, user_name) -> PlanResponse`

---

## Running Without Docker

Requires Python 3.12, a local PostgreSQL instance, and a virtual environment.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set DATABASE_URL in .env to point to your local Postgres
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Testing

Backend tests use a lightweight SQLite database and FastAPI's TestClient to validate authentication, protected routes, health checks, goal CRUD flows, and the mock AI provider.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt
pytest
```

---

## Production Deployment Notes

The backend `Dockerfile` is production-ready and starts the API with database migrations applied:

```dockerfile
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
```

In production:

- Use `DATABASE_URL` from your managed PostgreSQL provider.
- Set `JWT_SECRET_KEY` to a strong random value in your platform's secret manager.
- Keep `DEBUG=false` for all non-local environments.
- Set `CORS_ORIGINS` explicitly when your backend is used by browser-based clients.
- Set `AI_PROVIDER=openai` only if you also provide `OPENAI_API_KEY`.

Local Docker Compose is intentionally kept separate from production. The `docker-compose.yml` file is for development only; it mounts source code and runs Uvicorn with `--reload`.

---

## Docker Compose Services

```yaml
api:   FastAPI on port 8000, mounts .:/app for live reload
db:    PostgreSQL 16-alpine on port 5432, named volume postgres_data
```

The `api` service waits for the `db` healthcheck (`pg_isready`) before starting. Migrations run as part of the container startup command.

---

## Dependency Notes

All production dependencies are pinned. The `openai` package is intentionally excluded — it is optional and must be installed manually when `AI_PROVIDER=openai` is set.

```bash
pip install openai  # only needed for OpenAI provider
```
