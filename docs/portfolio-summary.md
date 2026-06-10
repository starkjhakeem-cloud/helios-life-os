# HELIOS — Portfolio Summary

A recruiter or engineer landing here for the first time. This document answers: what is HELIOS, what does it demonstrate technically, and how do you run it?

---

## What It Is

HELIOS is a full-stack mobile productivity application — an AI-powered "life operating system" for goal tracking, task management, daily briefings, and AI-assisted planning. It is a personal project built through structured incremental phases, with every phase shipping working code to the main branch.

The app is not a prototype or a UI demo. It is a production-grade codebase with:
- A persistent PostgreSQL database with schema migrations
- A stateless FastAPI backend containerised with Docker
- A React Native iOS app with 7 navigation tabs and 11 state stores
- JWT authentication with bcrypt password hashing
- A security-audited API where every route is protected and every query is scoped to the authenticated user

---

## Technical Highlights

### Full-Stack Architecture
- **Mobile**: React Native 0.83 / Expo SDK 55 / TypeScript strict mode
- **Backend**: FastAPI (Python 3.12) with Pydantic v2 validation and SQLAlchemy 2.0 ORM
- **Database**: PostgreSQL 16 with 6 Alembic migrations managing schema evolution
- **Infrastructure**: Docker Compose for local development; production-ready Dockerfile for deployment

### Design Patterns Worth Noting

**AI Provider Abstraction** — The backend's AI layer uses an abstract base class (`AIProvider`) with a factory function that reads a single environment variable (`AI_PROVIDER`) and returns the appropriate implementation. Switching from mock responses to real GPT calls requires zero router changes — just set `AI_PROVIDER=openai` and `OPENAI_API_KEY`. The OpenAI provider is a complete implementation covering briefing, planning, and chat, with structured error handling for all OpenAI error types.

**Optimistic State Updates** — User preferences update the UI instantly while the API call runs in the background. On network failure the store re-fetches from the server to restore correct state.

**Selective Persistence** — Zustand's persist middleware is applied only to the two stores that need it (auth credentials and user preferences). All other stores are in-memory and reset on logout, which prevents data from one user session leaking into another on the same device.

**Hydration Guard** — The root layout waits for AsyncStorage to finish reading before rendering any screen. This eliminates the "flash to login" problem on cold start without blocking the main thread.

**Ownership Enforcement** — Every database query that touches user data includes `WHERE user_id = current_user.id`. Optional foreign key fields (`linked_goal_id`, `task_id`, `goal_id`) are validated against the same user before being stored — preventing cross-user data linkage even when IDs are known.

### State Management
11 Zustand stores cover every domain. Each store owns its own loading, error, and data state. A single `logout()` action in the auth store calls `reset()` on all 9 data stores before clearing credentials — no stale data survives between sessions.

### API Layer
13 service modules each wrap a single resource. A shared `apiClient` provides typed `get`, `post`, `patch`, and `del` methods with a 15-second abort controller timeout and structured error parsing for both FastAPI's string and array `detail` formats.

---

## Feature Summary

| Feature | Detail |
|---|---|
| Authentication | Signup, login, JWT access tokens, persistent sessions, token revalidation on app start |
| Goals | CRUD with status lifecycle (active → completed → paused), optional target date |
| Tasks | CRUD with 4 priority levels, status lifecycle, due dates, optional goal link |
| Analytics | Aggregated metrics (completion rates, overdue tasks, active goals) computed live from PostgreSQL |
| AI Briefing | Structured daily summary: priorities, risks, recommendation |
| AI Planning | Multi-step execution plan generator with configurable horizon and optional goal anchoring |
| AI Chat | Conversational assistant with follow-up suggestions, action recommendations, and persistent history |
| AI Actions | One-tap execution of AI-recommended actions (create task, create goal, update task status) |
| Reminders | Local push notifications scheduled on-device via Expo Notifications, stored in PostgreSQL |
| User Preferences | Theme, planning horizon, notification toggles — persisted to PostgreSQL and synced to device |
| Profile / Settings | Account info, system version, notification permissions, reminders management, preferences panel |

---

## What It Demonstrates

**As a backend engineer:**
- Building structured REST APIs with FastAPI, Pydantic v2, and SQLAlchemy 2.0
- Designing multi-table PostgreSQL schemas with FK constraints, CASCADE rules, and Alembic migrations
- Implementing JWT authentication with bcrypt and proper security (algorithm allowlisting, timing-safe comparisons)
- Using abstract base classes and factory patterns for swappable service implementations
- Containerising a Python app for both local development and production deployment

**As a mobile engineer:**
- Building a multi-screen iOS app with Expo Router file-based navigation
- Managing complex cross-domain state with Zustand (11 stores, selective persistence)
- Implementing a typed API client with timeout, error handling, and JWT header injection
- Handling the iOS UX details: keyboard chaining, haptic feedback, safe area insets, pull-to-refresh, modal auto-focus
- Configuring local push notifications with platform permission flows
- Setting up EAS Build configuration for TestFlight distribution

**As a product engineer:**
- Structuring a project for incremental delivery — 39 phases, each shipping working code
- Making honest architectural trade-offs (mock AI provider is clearly documented; limitations are listed explicitly)
- Writing comprehensive documentation across README, deployment guide, security audit, iOS release guide, and architecture overview

---

## How to Run It (5 minutes)

**Requirements:** Docker Desktop, Node.js 20+, Xcode (for iOS Simulator)

```bash
# 1. Start the backend
cd backend
cp .env.example .env
# Generate a secret: python3 -c "import secrets; print(secrets.token_hex(32))"
# Paste it as JWT_SECRET_KEY in .env
docker compose up --build

# 2. Start the mobile app (new terminal)
cd mobile
npm install
npx expo start
# Press 'i' to open in iOS Simulator
```

The backend auto-runs Alembic migrations on startup. API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## Known Limitations (Honest)

- AI responses use a mock provider by default — the OpenAI provider is fully implemented; activate with two environment variables
- No refresh tokens — sessions expire after 60 minutes
- AsyncStorage is unencrypted (JWT not in iOS Keychain)
- Not yet released to TestFlight or the App Store

See the [Security section](../README.md#security) and [Roadmap](../README.md#roadmap) in the main README for the full list.
