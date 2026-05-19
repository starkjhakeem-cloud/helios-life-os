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
- [Screenshots](#screenshots)
- [Roadmap](#roadmap)

---

## Overview

HELIOS gives users a single system to manage goals, tasks, and daily priorities — backed by a structured AI planning engine. The name stands for the project's ambition: a full life-operating layer that surfaces what matters and when.

**What's working today:**
- JWT-authenticated REST API with full CRUD for goals and tasks
- PostgreSQL persistence with Alembic migrations
- Real-time analytics computed from live user data
- AI briefing and execution plan generation (mock provider; OpenAI integration prepared)
- Persistent login across app restarts with token revalidation
- Dark-themed iOS UI with a five-tab navigation shell

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│               HELIOS iOS App                         │
│           React Native 0.83 / Expo SDK 55            │
│                                                      │
│   (auth)          (tabs)                             │
│   Login ──────►  Home · Analytics · Agents           │
│   Signup          Goals · Tasks                      │
│        │                │                            │
│        └──── Zustand ───┘  (7 stores, persisted      │
│              Stores        auth via AsyncStorage)     │
│                  │                                    │
│          fetch + AbortController + JWT               │
└──────────────────┼───────────────────────────────────┘
                   │  Authorization: Bearer <token>
                   │  Content-Type: application/json
                   ▼
┌──────────────────────────────────────────────────────┐
│              FastAPI Backend (Python 3.12)            │
│                                                      │
│  /auth   /goals   /tasks   /analytics                │
│  /dashboard  /agents  /ai/briefing  /ai/plan         │
│                                                      │
│  Pydantic v2 validation → SQLAlchemy 2.0 ORM         │
│                                                      │
│  ┌─────────────────────────────────────┐             │
│  │        AI Provider Layer            │             │
│  │  AIProvider (abstract)              │             │
│  │    ├── MockAIProvider  ← default    │             │
│  │    └── OpenAIProvider  ← stub       │             │
│  └─────────────────────────────────────┘             │
└──────────────────┬───────────────────────────────────┘
                   │  SQLAlchemy / psycopg2
                   ▼
┌──────────────────────────────────────────────────────┐
│           PostgreSQL 16 (Docker volume)              │
│                                                      │
│   users ──< goals ──< tasks                          │
│   UUID PKs · FK constraints · tz-aware timestamps    │
└──────────────────────────────────────────────────────┘
```

All services run locally via Docker Compose. The mobile app communicates with the API over `localhost:8000` in development.

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
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── routers/            # Route handlers (one file per resource)
│   │   ├── schemas/            # Pydantic request/response models
│   │   ├── config.py           # Settings (pydantic-settings)
│   │   └── main.py             # App factory, middleware, exception handlers
│   ├── alembic/
│   │   └── versions/           # 001_users → 002_goals → 003_tasks
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example            # Environment template (copy to .env)
│
├── mobile/                     # React Native / Expo app
│   └── src/
│       ├── app/
│       │   ├── _layout.tsx     # Root layout — hydration guard + auth routing
│       │   ├── (auth)/         # Login, Signup screens
│       │   └── (tabs)/         # Home, Analytics, Agents, Goals, Tasks
│       ├── components/         # AgentCard, GoalCard, TaskCard, PlanCard, ...
│       ├── components/ui/      # Button, Input, Screen, Text primitives
│       ├── config/
│       │   └── api.ts          # BASE_URL + all endpoint constants
│       ├── hooks/
│       │   └── useBackendHealth.ts
│       ├── services/           # apiClient + per-resource service modules
│       ├── store/              # Zustand: useAuthStore + 6 data stores
│       └── theme/
│           └── theme.ts        # Colors, spacing, radius, typography tokens
│
├── docs/                       # (planned: architecture diagrams, API specs)
└── infrastructure/             # (planned: deployment configs)
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

**AI Planning (mock)**
- Daily briefing: summary, priorities, risks, recommendation
- Execution plan generator: structured multi-phase plan from a text prompt
- Plans adapt to the requested horizon (1–365 days)
- Optional goal context: pass a `goal_id` to anchor the plan to a specific goal
- AI responses are currently generated by a mock provider (see [AI Architecture](#ai-architecture))

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
| `APP_NAME` | No | `HELIOS` | Service name shown in health responses |
| `API_VERSION` | No | `v1` | API version prefix (`/api/v1/...`) |
| `DEBUG` | No | `false` | Set `true` to re-raise exceptions in development |
| `DATABASE_URL` | Yes | `postgresql://...` | PostgreSQL connection string (docker-compose overrides this automatically) |
| `JWT_SECRET_KEY` | Yes | — | HS256 signing key — generate with `secrets.token_hex(32)` |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | Token lifetime in minutes |
| `AI_PROVIDER` | No | `mock` | AI backend: `mock` or `openai` |
| `OPENAI_API_KEY` | Conditional | — | Required only when `AI_PROVIDER=openai` |

> `JWT_SECRET_KEY` must be set to a strong random value in any non-local environment. The default in `.env.example` is a placeholder.

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
└── openai_provider.py  # OpenAI stub — raises NotImplementedError until implemented
```

**Current state:** `AI_PROVIDER=mock` (default). The mock provider returns structured, contextually relevant responses without any external API calls.

**To enable OpenAI:**
1. `pip install openai`
2. Set `AI_PROVIDER=openai` in `.env`
3. Set `OPENAI_API_KEY=sk-...` in `.env`
4. Implement `OpenAIProvider.generate_briefing()` and `generate_plan()` in `app/ai/openai_provider.py`

The router code in `app/routers/ai.py` does not need to change — it calls `get_ai_provider()` and the factory handles the rest.

---

## Security

Phase 20 implemented the following hardening measures:

**Secrets**
- `backend/.env` is excluded from version control via `backend/.gitignore`
- `backend/.env.example` is the committed template (contains no real secrets)
- `JWT_SECRET_KEY` must be explicitly set; the default in `.env.example` is a placeholder

**Authentication**
- Passwords hashed with bcrypt (default work factor 12)
- JWT tokens validated on every protected request — algorithm is explicitly allowlisted (`algorithms=[settings.jwt_algorithm]`) to prevent algorithm-confusion attacks
- `HTTPBearer(auto_error=False)` used to return `401` instead of FastAPI's default `403` on missing credentials
- Login returns identical 401 for both "user not found" and "wrong password" — timing-safe via bcrypt's constant-time compare

**Input validation**
- All `status` and `priority` fields use `Pydantic Literal` types — invalid enum values rejected at the boundary with a descriptive 422
- String fields have `min_length` and `max_length` constraints throughout
- Email normalised (strip + lowercase) before storage and lookup

**CORS**
- `allow_credentials=False` — authentication is via Bearer token in the `Authorization` header, not cookies
- `allow_origins=["*"]` is intentional for a local-dev mobile API; restrict to specific origins before web deployment
- `allow_methods` and `allow_headers` are explicitly scoped

**Session management**
- `revalidate()` calls `/auth/me` on every app start — expired tokens are cleared before any protected screen renders
- Logout calls `reset()` on all six data stores before clearing credentials — no stale user data persists in memory

**What is not yet implemented**
- Refresh tokens (access tokens expire after 60 minutes, requiring re-login)
- Rate limiting on auth endpoints
- HTTPS enforcement (local dev uses HTTP)
- Secure enclave / Keychain storage for the JWT (AsyncStorage is unencrypted on-device)

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

The project is developed in numbered phases. Completed phases are marked.

**Completed**
- [x] Phase 1–12: Project scaffold, UI components, design system, navigation shell, backend API foundation, JWT auth, database layer
- [x] Phase 13: AI agents tab and protected agent profiles endpoint
- [x] Phase 14: Goals system — full CRUD with PostgreSQL persistence
- [x] Phase 15: Tasks system — full CRUD with priority levels and goal linking
- [x] Phase 16: Analytics — live aggregation from database
- [x] Phase 17: AI planning — mock briefing and execution plan generator
- [x] Phase 18: Auth persistence — AsyncStorage, hydration guard, token revalidation
- [x] Phase 19: OpenAI integration preparation — provider abstraction, factory, OpenAI stub
- [x] Phase 20: Security hardening — gitignore, CORS fix, enum validation, logout cleanup

**Planned**
- [ ] Phase 21: Documentation and portfolio readiness ← _current_
- [ ] Phase 22: OpenAI integration — real GPT responses for briefings and plans
- [ ] Phase 23: Refresh token support and longer-lived sessions
- [ ] Phase 24: Push notifications for overdue tasks and daily briefing
- [ ] Phase 25: Biometric authentication (Face ID / Touch ID)
- [ ] Phase 26: Live dashboard metrics computed from real user activity
- [ ] Phase 27: App Store build and deployment configuration
- [ ] Phase 28+: Calendar integration, multi-device sync, agent autonomy
