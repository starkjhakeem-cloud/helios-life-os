# HELIOS — Portfolio Marketing Materials

Copy-paste ready materials for resumes, LinkedIn, recruiters, and interviews.

---

## Resume Bullet Points

**Choose 1-3 based on role:**

### Full-Stack Focus
- Engineered HELIOS, a full-stack iOS productivity app combining React Native mobile frontend (Expo SDK, TypeScript, Zustand state management) with FastAPI backend (Python 3.12, Pydantic v2, SQLAlchemy 2.0 ORM) and PostgreSQL persistence; implemented end-to-end JWT authentication, 11 domain-scoped Zustand stores, and API client with timeout/error handling, shipping working code through 49 incremental development phases.

### Backend Focus
- Built FastAPI REST API for HELIOS goal-tracking app: designed PostgreSQL schema with 7 tables and Alembic migrations, implemented user-scoped query patterns with `get_current_user` dependency injection, developed pluggable AI provider abstraction (mock + OpenAI implementations), and containerised application for Docker Compose local dev and production deployment on Render/Railway/Fly.io.

### Mobile Focus
- Developed iOS app in React Native/Expo with file-based navigation (Expo Router), complex state management across 11 Zustand stores with selective AsyncStorage persistence, typed HTTP client with JWT token injection and 15-second timeout, local push notifications via Expo Notifications, and haptic feedback; shipped 49 incremental phases with working code on main branch.

### Product/Full-Stack Focus
- Led end-to-end development of HELIOS productivity app: structured 49-phase delivery schedule shipping working features at every phase, designed 6-table PostgreSQL schema with ownership enforcement patterns, implemented dual-provider AI abstraction layer (switchable via environment variable), and documented deployment workflows for mobile (EAS builds, TestFlight) and backend (Docker containers, managed PostgreSQL).

### Architecture/Design Patterns Focus
- Architected HELIOS full-stack app using design patterns: optimistic state updates with server re-sync on network failure, selective persistence to prevent cross-session data leakage, hydration guards to eliminate UI flashing, ownership enforcement via SQL constraints and route-level validation, and pluggable AI backends via abstract base class + factory function.

---

## LinkedIn Post Draft

### Option 1: Technical Focus (2 paragraphs)
Shipped HELIOS — a full-stack iOS productivity app that combines goal tracking, AI-assisted planning, and real-time analytics.

**Technical Stack:**
- Frontend: React Native + Expo, TypeScript, Zustand (11 stores), custom API client
- Backend: FastAPI + Pydantic v2, SQLAlchemy 2.0 ORM, PostgreSQL with Alembic migrations
- Infrastructure: Docker Compose (local), Dockerfile (production), EAS Build (TestFlight)

**What Makes It Real:**
- 8/8 backend tests passing, 2 test suites on mobile, TypeScript strict mode, no secrets committed
- User-scoped SQL queries (ownership enforcement), JWT auth with bcrypt hashing
- Production-ready: deployment guides for Render/Railway, migration history, architecture docs

The project demonstrates end-to-end delivery: from database schema through API design to mobile UX, with emphasis on working code over features. Every phase ships tested functionality to main branch.

Open to discuss system design, mobile architecture, backend patterns, or the philosophy of incremental delivery.

### Option 2: Product Focus (1 paragraph)
Built HELIOS, a full-stack iOS app for goal tracking and AI-powered planning. The app combines goals, tasks, reminders, and analytics with an AI layer that generates daily briefings and execution plans. Behind the scenes: a typed REST API (FastAPI + Pydantic), persistent PostgreSQL database with migration history, and a design pattern for swapping AI providers (mock by default, OpenAI via env vars). 49 phases of incremental development, every one shipping working code. Open to technical discussions about full-stack architecture, mobile state management, or deployment patterns.

### Option 3: Short Version (1 sentence + link)
Shipped HELIOS — full-stack iOS productivity app with AI planning, goal tracking, and analytics. [github.com/yourname/helios-life-os](https://github.com/yourname/helios-life-os) | [See the case study](PORTFOLIO.md)

---

## Recruiter-Facing Description (30 seconds)

HELIOS is a working iOS productivity app I built to demonstrate full-stack engineering: React Native mobile frontend with TypeScript and Zustand state management, FastAPI backend with Pydantic validation and SQLAlchemy ORM, and PostgreSQL database with schema migrations. The app handles user authentication, goal/task CRUD operations, real-time analytics, and AI-powered planning suggestions. I emphasize production practices: every endpoint is tested, user data is scoped by ownership, secrets never enter the repository, and the backend is ready for deployment on Docker. The project shipped through 49 incremental phases — each one with working, documented code on main.

---

## Technical Interview Description

### 30-Second Version
HELIOS is a full-stack iOS app combining Expo/React Native, FastAPI, PostgreSQL, and Docker. The mobile app manages goals and tasks through 11 Zustand stores with selective persistence. The backend provides user-scoped REST endpoints with JWT auth. The standout feature is an abstracted AI layer — base class + factory pattern enables switching from mock responses to OpenAI with a single environment variable. No code changes needed. Want to dig into any layer?

### 2-Minute Version (Technical)
HELIOS is a full-stack iOS productivity app I built in 49 phases to explore complete product engineering.

**Mobile:** React Native (Expo), TypeScript strict mode. 11 Zustand stores organize state by domain. Only two stores persist to AsyncStorage — auth and settings. The rest reset on logout, preventing data leakage. I implemented a custom HTTP client that handles JWT injection, 15-second timeout with AbortController, and structured error parsing for both FastAPI and client errors.

**Backend:** FastAPI on Python 3.12. One router per resource (auth, goals, tasks, analytics, etc.). Every protected route uses `get_current_user` dependency injection, ensuring queries are scoped to the authenticated user. I use Pydantic v2 for validation and SQLAlchemy 2.0 with typed columns. The AI layer is interesting — abstract base class with two implementations: a mock provider (returns hardcoded JSON instantly) and an OpenAI provider (complete GPT integration with structured error handling). Switching between them requires only `AI_PROVIDER=openai` and an API key.

**Database:** PostgreSQL with 7 tables and Alembic migrations. Users table has FK constraints to goals, tasks, reminders, and preferences. Foreign key fields on tasks (optional goal link) are validated in the API layer to ensure users can't link their tasks to other users' goals. UUID primary keys, CASCADE/SET NULL rules for data consistency.

**Infrastructure:** Docker Compose for local dev (bind-mount source, auto-reload). Production Dockerfile that runs migrations before starting Uvicorn (no reload). Environment-driven config with pydantic-settings — secrets never committed. The app is ready for deployment on Render, Railway, Fly.io, or any Docker host.

The whole thing is tested: 8 backend tests (auth, goals, health), 2 mobile test suites (API client, error handling). TypeScript in strict mode. All docs in the repo.

### Design Pattern: Ownership Enforcement
Every query includes `WHERE user_id = current_user.id`. The tasks table has an optional `linked_goal_id` — when users create a task linked to a goal, the API validates that the goal belongs to the same user. Without this check, users could discover each other's goal IDs and link their tasks to them. With it, the data model prevents cross-user linkage at the database layer.

### Design Pattern: Selective Persistence
Only auth and user preferences persist to AsyncStorage. This means goals/tasks/reminders/conversations live in-memory only. On app restart, they're re-fetched from the server. This eliminates the problem of stale data from one user session leaking into the next user's session on a shared device.

### What's Next
Two areas I'd expand: (1) Refresh tokens — currently access tokens expire in 60 minutes and users re-login. (2) Remote push notifications — today's reminders are local-only. Adding either one is straightforward given the current architecture.

---

## Talking Points by Audience

### Hiring Manager (Non-Technical)
"HELIOS is a complete iOS app I built to show I can ship full-stack. It has user authentication, a database backend, and an AI features. Every phase shipped working code — it's not just a prototype or a design mockup. It's deployable and tested. The project demonstrates my ability to take a feature from concept through design, implementation, testing, and documentation."

### Backend Engineer Peer
"The backend is a FastAPI app with a clean router-per-resource architecture. All user data is scoped by ownership at the query level. I used SQLAlchemy 2.0 with typed columns, Pydantic v2 validation, and Alembic migrations. The AI layer is pluggable — abstract base class + factory + environment variable means I can swap implementations without touching route handlers. Eight tests covering auth, goals, and analytics. Containerised for both local reload and production."

### Mobile Engineer Peer
"11 Zustand stores, only two persist to AsyncStorage. The API client is typed with timeout handling and structured error parsing. Expo Router for navigation. SF Symbols for icons. Haptic feedback on interactions. The hydration guard on the root layout prevents the 'flash to login' problem. I handle safe area insets, keyboard chaining, and pull-to-refresh."

### DevOps / Infrastructure
"Local dev uses Docker Compose with bind-mounted source and auto-reload. Production Dockerfile runs Alembic migrations then starts Uvicorn (no reload). Environment-driven config with pydantic-settings — no secrets in the image. Ready for deployment on Render, Railway, Fly.io, AWS ECS, or any Docker host. The mobile app uses EAS Build for cloud builds and TestFlight distribution."

---

## GitHub README Intro (Polish Version)

For use at the top of README.md if you want to emphasize portfolio/demonstration aspects:

---

# HELIOS

> A full-stack iOS productivity app demonstrating complete product engineering: goal tracking, task management, AI-assisted planning, analytics, and production-grade infrastructure.

**Status:** ✅ V1 Release Candidate — Portfolio-demo ready. All features working. No blockers.

**This is not a prototype or a design mockup.** HELIOS is a production-grade codebase with:
- 8/8 backend tests passing, 2 mobile test suites, TypeScript strict mode
- User-scoped SQL queries preventing cross-user data leakage
- JWT authentication with bcrypt password hashing
- PostgreSQL persistence with Alembic migration history
- Docker containerisation for local development and production deployment
- No secrets committed — all environment-driven configuration
- Comprehensive documentation across architecture, deployment, and release workflows

**Built through 49 phases of incremental delivery.** Every phase ships working, tested functionality to main — no feature stubs.

---

## Quick Links

- **[Portfolio Case Study](PORTFOLIO.md)** — Full technical writeup, design patterns, feature inventory
- **[Architecture Deep-Dive](docs/architecture-overview.md)** — Database schema, API structure, state management
- **[Deployment Guide](docs/deployment.md)** — Production hosting options (Render, Railway, Fly.io)
- **[iOS Release](docs/ios-release.md)** — TestFlight submission checklist
- **[Tech Stack & Features](#tech-stack)** — See below for details

---

## The 5-Minute Demo

```bash
# 1. Backend
cd backend && cp .env.example .env
# Paste a generated secret as JWT_SECRET_KEY:
# python3 -c "import secrets; print(secrets.token_hex(32))"
docker compose up --build

# 2. Mobile (new terminal)
cd mobile && npm install && npx expo start
# Press i for iOS Simulator

# 3. Try it
# Sign up with any email/password
# Create a goal, add tasks, check analytics
# Tap Agents to generate an AI plan
# API docs at http://localhost:8000/docs
```

---
