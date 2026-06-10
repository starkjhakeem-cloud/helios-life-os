# HELIOS

**AI-powered Life Operating System** — a full-stack iOS application for goal tracking, task management, and AI-driven personal productivity intelligence.

Built mobile-first with React Native / Expo and a FastAPI backend, HELIOS is an ongoing personal project developed through structured incremental phases. Each phase ships working, tested functionality — no feature stubs in the main branch.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Features](#features)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [AI Architecture](#ai-architecture)
- [Security](#security)
- [Deployment](#deployment)
- [Screenshots](#screenshots)
- [Roadmap](#roadmap)

---

## Overview

HELIOS gives users a single system to manage goals, tasks, and daily priorities — backed by a structured AI planning engine. The name stands for the project's ambition: a full life-operating layer that surfaces what matters and when.

**What's working today:**
- JWT-authenticated REST API with full CRUD for goals, tasks, reminders, and user preferences
- PostgreSQL persistence with 6 Alembic migrations tracking schema evolution
- Real-time analytics computed from live user data
- AI daily briefing, execution plan generator, and conversational assistant (mock provider default; OpenAI integration complete — activate with two env vars)
- Persistent AI conversation history with per-conversation message storage
- Local push notifications via Expo Notifications with per-user enable/disable preferences
- User preferences system (theme, planning horizon, notification toggles) persisted to PostgreSQL
- Persistent login across app restarts with token revalidation on every cold start
- Dark-themed iOS app with 7-tab navigation shell, haptic feedback, and pull-to-refresh

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    HELIOS iOS App                          │
│              React Native 0.83 / Expo SDK 55               │
│                                                            │
│  (auth)          (tabs — 7 screens)                        │
│  Login ──────►  Home · Analytics · Agents · Assistant      │
│  Signup          Goals · Tasks · Profile                   │
│       │                 │                                   │
│       └──── Zustand ────┘  11 stores                       │
│             Stores         auth + settings persisted        │
│             (AsyncStorage) all others in-memory            │
│                  │                                          │
│         fetch + AbortController + 15 s timeout             │
│         Authorization: Bearer <JWT>                         │
└──────────────────────┼─────────────────────────────────────┘
                       │  HTTPS (HTTP in local dev)
                       ▼
┌────────────────────────────────────────────────────────────┐
│               FastAPI Backend (Python 3.12)                │
│                                                            │
│  /auth  /goals  /tasks  /analytics  /dashboard             │
│  /agents  /ai/briefing  /ai/plan  /ai/chat                 │
│  /ai/actions/execute  /ai/conversations                    │
│  /reminders  /settings/preferences  /health                │
│                                                            │
│  Pydantic v2 validation → SQLAlchemy 2.0 ORM               │
│                                                            │
│  ┌──────────────────────────────────────────┐              │
│  │           AI Provider Layer              │              │
│  │  AIProvider (abstract base class)        │              │
│  │    ├── MockAIProvider  ← default         │              │
│  │    └── OpenAIProvider  ← complete impl    │              │
│  │  context_builder: injects live user data │              │
│  └──────────────────────────────────────────┘              │
└──────────────────────┬─────────────────────────────────────┘
                       │  SQLAlchemy / psycopg2
                       ▼
┌────────────────────────────────────────────────────────────┐
│              PostgreSQL 16 (Docker volume)                 │
│                                                            │
│  users ──< goals ──< tasks                                 │
│        ──< conversations ──< conversation_messages         │
│        ──< reminders                                       │
│        ──  user_preferences  (1-to-1)                      │
│                                                            │
│  UUID PKs · FK constraints · CASCADE/SET NULL · Alembic    │
└────────────────────────────────────────────────────────────┘
```

All services run locally via Docker Compose. The mobile app communicates with the API over `localhost:8000` in development; the production URL is injected via `EXPO_PUBLIC_API_URL` at EAS Build time.

---

## Tech Stack

### Mobile
| Layer | Technology | Version |
|---|---|---|
| Framework | React Native | 0.83.6 |
| Runtime | Expo SDK | 55 |
| Navigation | Expo Router (file-based) | 55 |
| Language | TypeScript (strict) | 5.9 |
| State | Zustand | 5.x |
| Persistence | AsyncStorage | 2.2.0 |
| HTTP | Native `fetch` + AbortController | — |
| UI | Custom component library | — |
| Icons | SF Symbols (`expo-symbols`) | 55 |

### Backend
| Layer | Technology | Version |
|---|---|---|
| Framework | FastAPI | 0.115.4 |
| Language | Python | 3.12 |
| Validation | Pydantic v2 | 2.9.2 |
| Config | pydantic-settings | 2.6.1 |
| ORM | SQLAlchemy | 2.0.36 |
| Migrations | Alembic | 1.14.0 |
| Auth | PyJWT (HS256) | 2.9.0 |
| Passwords | bcrypt | 4.2.1 |
| Server | Uvicorn | 0.32.0 |
| Database | PostgreSQL | 16 |
| Containers | Docker Compose | — |

---

## Project Structure

```
HELIOS/
├── backend/                    # FastAPI + PostgreSQL API
│   ├── app/
│   │   ├── ai/                 # Provider abstraction layer
│   │   │   ├── base.py         # AIProvider abstract base class
│   │   │   ├── factory.py      # Provider selection from config
│   │   │   ├── mock_provider.py
│   │   │   └── openai_provider.py  # Stub (ready for implementation)
│   │   ├── core/
│   │   │   ├── jwt.py          # Token creation + validation
│   │   │   └── security.py     # bcrypt hashing
│   │   ├── db/
│   │   │   ├── base.py         # DeclarativeBase
│   │   │   └── session.py      # Session factory + get_db dependency
│   │   ├── dependencies/
│   │   │   └── auth.py         # get_current_user FastAPI dependency
│   │   ├── models/             # SQLAlchemy ORM models (user, goal, task, reminder, prefs)
│   │   ├── routers/            # Route handlers (one file per resource)
│   │   ├── schemas/            # Pydantic request/response models
│   │   ├── config.py           # Settings (pydantic-settings, reads .env)
│   │   └── main.py             # App factory, CORS middleware, exception handlers
│   ├── alembic/
│   │   └── versions/           # 001_users → … → 006_user_preferences
│   ├── docker-compose.yml      # Local development (bind-mount + --reload)
│   ├── Dockerfile              # Production image (alembic + uvicorn, no --reload)
│   ├── requirements.txt
│   └── .env.example            # Environment template — copy to .env
│
├── mobile/                     # React Native / Expo app
│   ├── .env.example            # Expo env variable template
│   └── src/
│       ├── app/
│       │   ├── _layout.tsx     # Root layout — hydration guard + auth routing
│       │   ├── (auth)/         # Login, Signup screens
│       │   └── (tabs)/         # Home, Analytics, Agents, Goals, Tasks, Profile
│       ├── components/         # AgentCard, GoalCard, TaskCard, PlanCard, ...
│       ├── components/ui/      # Button, Input, Screen, Text primitives
│       ├── config/
│       │   └── api.ts          # API_CONFIG (EXPO_PUBLIC_API_URL) + all endpoints
│       ├── hooks/
│       │   └── useBackendHealth.ts
│       ├── services/           # apiClient + per-resource service modules
│       ├── store/              # Zustand: useAuthStore + 8 data stores
│       └── theme/
│           └── theme.ts        # Colors, spacing, radius, typography tokens
│
└── docs/
    ├── deployment.md              # Production deployment guide (Render, Railway, Fly.io)
    ├── ios-release.md             # TestFlight / App Store release checklist
    ├── architecture-overview.md   # Deep-dive system and data architecture
    ├── demo-plan.md               # Screenshot checklist and demo walkthrough script
    ├── portfolio-summary.md       # Recruiter-facing project summary
    ├── post-v1-backlog.md         # Prioritized backlog and recommended next phases
    ├── demo-video-script.md       # 2-min and 5-min video scripts with exact narration
    ├── recruiter-walkthrough.md   # Non-technical presentation guide and Q&A
    ├── screenshot-guide.md        # Step-by-step screenshot capture with data seeding
    └── technical-talking-points.md  # Interview prep: system design, trade-offs, limitations
```

---

## Features

### Implemented

**Authentication**
- Sign up with name, email, and password (bcrypt hashed, server-side)
- Login with JWT access token (HS256, configurable expiry)
- `/auth/me` endpoint for session revalidation on app start
- Persistent login across restarts via AsyncStorage + Zustand persist
- Hydration guard prevents flash-to-login during AsyncStorage read
- Full logout wipes all cached user data across all stores

**Goals**
- Create goals with title, description, status, and optional target date
- List all goals for the authenticated user
- Update goal status (`active` → `completed` → `paused`)
- Delete goals (cascades to unlink associated tasks)

**Tasks**
- Create tasks with title, description, status, priority, due date, and optional goal link
- Four priority levels: `low`, `medium`, `high`, `critical`
- Three status values: `todo`, `in_progress`, `done`
- List, update, and delete tasks per user

**Analytics**
- Goal metrics: total, completed, active, paused, completion rate
- Task metrics: total, completed, in-progress, todo, overdue, high-priority
- All values computed live from PostgreSQL at request time

**Dashboard**
- Metric tiles (productivity, focus time, tasks done, energy)
- AI insight and mission sections
- All data served from authenticated API endpoint

**Agents**
- Five AI agent profiles: Strategy, Finance, Study, Health, Career
- Each profile includes name, role, status, description, and priority
- Protected endpoint — requires valid JWT

**AI Planning and Chat (mock provider)**
- Daily briefing: summary, priorities, risks, and recommendation
- Execution plan generator: structured multi-step plan from a text prompt, scoped to a configurable planning horizon
- Optional goal context: anchor a plan to a specific goal for targeted advice
- Conversational AI assistant with follow-up questions and action recommendations
- AI can recommend actions (create task, create goal, update status) and execute them after user confirmation
- Persistent conversation history: all exchanges stored in PostgreSQL, reloaded on app start
- Provider abstraction: swap between mock and OpenAI by changing one environment variable
- Live user context injection: AI sees the user's current goals and tasks when context is enabled

**Reminders**
- Create reminders with a title, optional note, and future date/time
- Enable and disable individual reminders
- Local push notifications scheduled via Expo Notifications (no server required)
- Notification permissions requested safely, with graceful handling for denied state
- All reminders stored in PostgreSQL and synced to the device on login

**User Preferences**
- Theme preference (system / dark / light) stored per user
- Default planning horizon (3 / 7 / 14 / 30 days) used as the AI plan default
- Notification master toggle and reminder-specific toggle
- All preferences persisted to PostgreSQL and loaded into AsyncStorage on login
- Optimistic updates: UI reflects changes instantly while the API call runs in the background

**Settings and Profile**
- User account info (name, email, member since)
- System version info from the live backend
- Notification permission status with in-app request flow
- Reminders management (create, enable/disable, delete)
- User preferences panel with segmented pickers and toggles
- Sign-out with complete state wipe across all stores

### Planned

See [Roadmap](#roadmap).

---

## Local Setup

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) (for backend + database)
- [Node.js](https://nodejs.org) 20+ and npm
- [Xcode](https://developer.apple.com/xcode/) (for iOS Simulator)
- [Expo CLI](https://docs.expo.dev/get-started/installation/): `npm install -g expo-cli`

### 1. Clone and configure

```bash
git clone <repo-url>
cd HELIOS
```

### 2. Start the backend

```bash
cd backend
cp .env.example .env
# Edit .env — set a strong JWT_SECRET_KEY before running
```

Generate a secret:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

```bash
docker compose up --build
```

This starts two services:
- `api` — FastAPI on `localhost:8000` (auto-runs `alembic upgrade head` on startup)
- `db` — PostgreSQL 16 on `localhost:5432`

Verify the API is healthy:
```bash
curl http://localhost:8000/api/v1/health
# {"status":"ok","service":"HELIOS","timestamp":"..."}
```

Interactive API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Start the mobile app

```bash
cd mobile
npm install
npx expo start
```

Press `i` to open in iOS Simulator. The app connects to `http://localhost:8000` in development (`__DEV__ === true`).

> If running on a physical device, update `API_CONFIG.BASE_URL` in `mobile/src/config/api.ts` to your machine's local IP address (e.g., `http://192.168.1.x:8000`).

---

## Environment Variables

All backend configuration is loaded from `backend/.env`. Copy `backend/.env.example` to get started — the file is excluded from version control.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://helios:helios@localhost:5432/helios` | PostgreSQL connection string — docker-compose sets the `db` hostname automatically |
| `JWT_SECRET_KEY` | **Yes** | placeholder | HS256 signing key — generate with `secrets.token_hex(32)` |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | Token lifetime in minutes |
| `DEBUG` | No | `false` | Re-raises unhandled exceptions; never `true` in production |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins — restrict when adding a web frontend |
| `AI_PROVIDER` | No | `mock` | AI backend: `mock` (no external calls) or `openai` |
| `OPENAI_API_KEY` | Conditional | — | Required only when `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model to use with the OpenAI provider |

> `JWT_SECRET_KEY` must be a strong random value in any non-local deployment. Generate one: `python3 -c "import secrets; print(secrets.token_hex(32))"`

---

## API Reference

The backend runs on `/api/v1`. All endpoints except `/health` and `/version` require `Authorization: Bearer <token>`.

Interactive documentation is available at **[http://localhost:8000/docs](http://localhost:8000/docs)** (Swagger UI) and **[http://localhost:8000/redoc](http://localhost:8000/redoc)** (ReDoc) when the server is running.

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | No | Service health check |
| `GET` | `/api/v1/version` | No | Service version info |
| `POST` | `/api/v1/auth/signup` | No | Register a new user |
| `POST` | `/api/v1/auth/login` | No | Login, receive JWT |
| `GET` | `/api/v1/auth/me` | Yes | Validate token, return current user |
| `GET` | `/api/v1/dashboard/summary` | Yes | Dashboard metrics and sections |
| `GET` | `/api/v1/goals` | Yes | List goals for current user |
| `POST` | `/api/v1/goals` | Yes | Create a goal |
| `PATCH` | `/api/v1/goals/{id}` | Yes | Update a goal |
| `DELETE` | `/api/v1/goals/{id}` | Yes | Delete a goal |
| `GET` | `/api/v1/tasks` | Yes | List tasks for current user |
| `POST` | `/api/v1/tasks` | Yes | Create a task |
| `PATCH` | `/api/v1/tasks/{id}` | Yes | Update a task |
| `DELETE` | `/api/v1/tasks/{id}` | Yes | Delete a task |
| `GET` | `/api/v1/analytics/summary` | Yes | Aggregated goal and task metrics |
| `GET` | `/api/v1/agents` | Yes | List AI agent profiles |
| `GET` | `/api/v1/ai/briefing` | Yes | Daily AI briefing |
| `POST` | `/api/v1/ai/plan` | Yes | Generate an execution plan |
| `POST` | `/api/v1/ai/chat` | Yes | Conversational AI with action recommendations |
| `POST` | `/api/v1/ai/actions/execute` | Yes | Execute an AI-recommended action |
| `GET` | `/api/v1/ai/conversations` | Yes | List saved conversation summaries |
| `GET` | `/api/v1/reminders` | Yes | List reminders for current user |
| `POST` | `/api/v1/reminders` | Yes | Create a reminder |
| `PATCH` | `/api/v1/reminders/{id}` | Yes | Update a reminder |
| `DELETE` | `/api/v1/reminders/{id}` | Yes | Delete a reminder |
| `GET` | `/api/v1/settings/preferences` | Yes | Get user preferences (creates defaults on first call) |
| `PATCH` | `/api/v1/settings/preferences` | Yes | Update user preferences |

### Error format

All error responses follow the FastAPI standard:

```json
{ "detail": "Human-readable message." }
```

Validation errors (422) include field-level context:

```json
{
  "detail": [
    {
      "type": "literal_error",
      "loc": ["body", "priority"],
      "msg": "Input should be 'low', 'medium', 'high' or 'critical'"
    }
  ]
}
```

---

## AI Architecture

AI responses are abstracted behind a provider interface so the underlying model can be swapped without changing any routing or schema code.

```
app/ai/
├── base.py          # AIProvider — abstract base with generate_briefing() and generate_plan()
├── factory.py       # get_ai_provider() — reads AI_PROVIDER from config, returns instance
├── mock_provider.py # Deterministic responses for development and testing
└── openai_provider.py  # Full OpenAI implementation with structured error handling
```

**Current state:** `AI_PROVIDER=mock` (default). The mock provider returns structured, contextually relevant responses without any external API calls.

**To enable OpenAI:**
1. Set `AI_PROVIDER=openai` in `.env`
2. Set `OPENAI_API_KEY=sk-...` in `.env`

That's it. `OpenAIProvider` is a complete implementation covering briefing, planning, and chat — with structured error handling for `AuthenticationError`, `RateLimitError`, `APIConnectionError`, and `APIStatusError`. The `openai` package is already in `requirements.txt`.

The router code in `app/routers/ai.py` does not need to change — it calls `get_ai_provider()` and the factory validates the key and returns the appropriate instance.

---

## Security

### Phase 37 audit findings

A full security audit was performed across all backend routes, schemas, auth dependencies, and frontend token handling. The following issues were found and fixed:

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `POST /tasks` — `linked_goal_id` stored without ownership check | Medium | **Fixed** |
| 2 | `POST /reminders` — `task_id` and `goal_id` stored without ownership check | Medium | **Fixed** |
| 3 | AI `execute_action(create_task)` — `linked_goal_id` stored without ownership check | Medium | **Fixed** |
| 4 | No startup warning when `JWT_SECRET_KEY` is a known weak placeholder | Low | **Fixed** |
| 5 | `backend/.env` appears in early git history (value was a placeholder `your-secret-here`, not a real secret) | Low | **Documented** |

All other surfaces checked out clean: every route uses `get_current_user`, every DB query filters by `current_user.id`, no password ever appears in a response schema, JWT uses an explicit algorithm allowlist, login gives identical 401 for "not found" vs "wrong password", and logout clears all in-memory state.

**Fix 1–3**: Each of the three creation endpoints now fetches the referenced record with `WHERE id = ? AND user_id = current_user.id` before accepting it. A 404 is returned if the record doesn't exist or belongs to a different user.

**Fix 4**: `main.py` logs a `WARNING` at startup if `JWT_SECRET_KEY` matches any known placeholder. This catches misconfigured deployments without breaking local development.

**Fix 5 (historical .env)**: The committed values were always placeholders (`your-secret-here`), so no real secret was ever exposed. Before a public repository release, purge the history with `git filter-repo --path backend/.env --invert-paths`. See [docs/deployment.md](docs/deployment.md) for instructions.

---

### What is correctly hardened

**Secrets**
- `backend/.env` excluded from version control (`backend/.gitignore`)
- `backend/.env.example` is the committed template — no real values
- Startup logs a warning if `JWT_SECRET_KEY` is a weak placeholder

**Authentication**
- Passwords hashed with bcrypt (random salt, default work factor 12)
- JWT algorithm explicitly allowlisted (`algorithms=[settings.jwt_algorithm]`) — prevents algorithm-confusion attacks
- JWT `"type": "access"` claim checked — prevents token type confusion
- `HTTPBearer(auto_error=False)` returns `401` instead of FastAPI's default `403`
- Login returns identical `401` for "not found" and "wrong password" — timing-safe via bcrypt constant-time compare

**Authorization**
- Every endpoint uses `Depends(get_current_user)`
- Every query filters by `current_user.id` — cross-user data access is not possible at the ORM layer
- Optional foreign key fields (`linked_goal_id`, `task_id`, `goal_id`) are now validated to belong to `current_user` before being stored

**Input validation**
- All `status` and `priority` fields use `Pydantic Literal` types — invalid values rejected at the boundary with a 422
- String fields have `min_length` and `max_length` constraints throughout
- Email normalised (strip + lowercase) before storage and lookup

**CORS**
- `allow_credentials=False` — auth is via Bearer token in the `Authorization` header, not cookies
- `CORS_ORIGINS` is configurable via environment variable (default `*` is safe for a native mobile API)
- `allow_methods` and `allow_headers` are explicitly scoped

**Session management**
- `revalidate()` calls `/auth/me` on every app start — expired tokens cleared before any protected screen renders
- Logout calls `reset()` on all 9 data stores before clearing credentials — no stale user data in memory

---

### Known limitations (honest)

| Limitation | Notes |
|---|---|
| No refresh tokens | Access tokens expire after 60 minutes; users must re-login |
| HTTP in local dev | HTTPS is only in effect when deployed behind a TLS-terminating proxy |
| AsyncStorage is unencrypted | JWT stored in AsyncStorage; not in iOS Keychain or Android Keystore |
| No email verification | Any email format is accepted at signup |

---

## Testing

### Backend
Run backend tests from the `backend` folder with `pytest`. The backend test harness uses a temporary SQLite database so local development does not require a PostgreSQL instance.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt
pytest
```

### Mobile
Run mobile unit tests from the `mobile` folder with Jest.

```bash
cd mobile
npm install
npm test
```

## Deployment

The full deployment guide is in [docs/deployment.md](docs/deployment.md). This section summarises the key points.

### Backend — hosting targets

The backend is a stateless FastAPI container. Any platform that runs Docker works:

| Platform | Notes |
|---|---|
| **Render** | Deploy from GitHub, automatic TLS, free PostgreSQL trial |
| **Railway** | Mono-repo friendly, auto-detects Dockerfile, built-in PostgreSQL plugin |
| **Fly.io** | CLI-first, `fly launch` from `backend/`, Postgres clusters available |

The `Dockerfile` is production-ready: it copies Alembic migrations into the image and runs `alembic upgrade head` before starting Uvicorn (no `--reload`). The `docker-compose.yml` overrides this for local development only.

### Database

Use a managed PostgreSQL service — never run the database in the same container as the API in production. Recommended options: **Supabase**, **Neon**, **Railway PostgreSQL**, or **Render PostgreSQL**.

### Mobile — Expo / EAS Build

Production iOS/Android builds go through [EAS Build](https://docs.expo.dev/build/introduction/). The production API URL is injected at build time via `EXPO_PUBLIC_API_URL`:

```json
// eas.json
{
  "build": {
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "https://your-api.your-domain.com" }
    }
  }
}
```

In development (`__DEV__ === true`) the app always connects to `localhost:8000`.

### Pre-deployment checklist

- [ ] Strong `JWT_SECRET_KEY` set in the hosting platform's secret manager
- [ ] `DATABASE_URL` points to managed PostgreSQL (not localhost)
- [ ] `DEBUG=false`
- [ ] Backend reachable over HTTPS before building the EAS binary
- [ ] `EXPO_PUBLIC_API_URL` set in the EAS build profile
- [ ] `/api/v1/health` returns 200 on the production URL

---

## Screenshots

> Screenshots will be added once the app reaches visual stability. The sections below will contain simulator captures of each main screen.

| Home Dashboard | Goals | Tasks |
|---|---|---|
| _coming soon_ | _coming soon_ | _coming soon_ |

| Analytics | Agents | AI Planner |
|---|---|---|
| _coming soon_ | _coming soon_ | _coming soon_ |

---

## Roadmap

**Completed (Phases 1–39)**

- [x] **Phases 1–12** — Project scaffold, design system, navigation shell, backend API foundation, JWT authentication, PostgreSQL database layer
- [x] **Phase 13** — AI agents tab and protected agent profiles endpoint
- [x] **Phase 14** — Goals system — full CRUD with PostgreSQL persistence
- [x] **Phase 15** — Tasks system — CRUD with priority levels, due dates, and goal linking
- [x] **Phase 16** — Analytics — live aggregation from PostgreSQL at request time
- [x] **Phase 17** — AI planning — daily briefing and execution plan generator with mock provider
- [x] **Phase 18** — Auth persistence — AsyncStorage, hydration guard, token revalidation on cold start
- [x] **Phase 19** — OpenAI provider — abstract base class, factory pattern, complete OpenAI implementation with error handling
- [x] **Phase 20** — Security hardening — CORS, enum validation, logout state wipe
- [x] **Phases 21–25** — AI chat/assistant, action recommendations, one-tap action execution
- [x] **Phase 26** — Persistent AI conversation history — full message storage in PostgreSQL
- [x] **Phases 27–32** — AI context builder, prompt engineering improvements, conversation management
- [x] **Phase 33** — Reminders and local notifications — Expo Notifications, per-reminder scheduling
- [x] **Phase 34** — User preferences system — theme, planning horizon, notification toggles, PostgreSQL persistence
- [x] **Phase 35** — Deployment readiness — production Dockerfile, CORS configuration, EAS environment variables
- [x] **Phase 36** — Mobile polish — haptic feedback, input focus states, keyboard chaining, pull-to-refresh, SF Symbol empty states
- [x] **Phase 37** — Security audit — FK ownership validation, JWT startup warning, known-limitations documentation
- [x] **Phase 38** — iOS / TestFlight preparation — bundle identifier, build number, EAS build profiles, splash screen
- [x] **Phase 39** — Portfolio and demo assets — architecture overview, demo plan, portfolio summary
- [x] **Phase 40** — V1 completion audit — logout store fixes, OpenAI documentation corrected
- [x] **Phase 41** — Post-V1 backlog — prioritized next phases, difficulty ratings, honest known gaps
- [x] **Phase 42** — High-priority post-V1 fixes: live dashboard metrics, auth rate limiting, account deletion, AI Alerts UI removed, `openai` pinned
- [x] **Phase 43** — Portfolio demo execution package: demo video scripts, recruiter walkthrough, screenshot guide, technical interview talking points

**Planned**

- [ ] **Phase 43** — AI context always-on in chat (send `include_context: true` to AI assistant)
- [ ] **Phase 44** — OpenAI activation (implementation complete; add key + set `AI_PROVIDER=openai`)
- [ ] **Phase 45** — TestFlight distribution (EAS build + Apple credentials)
- [ ] **Phase 46** — Splash image, icon audit, App Store screenshots
- [ ] Refresh tokens — longer-lived sessions without re-login
- [ ] Remote push notifications (APNs) — server-triggered alerts
- [ ] Face ID / Touch ID — biometric authentication
- [ ] Date picker components — replace plain-text date inputs
- [ ] Account deletion — required for App Store compliance

See [docs/post-v1-backlog.md](docs/post-v1-backlog.md) for the full prioritized backlog with difficulty ratings.
