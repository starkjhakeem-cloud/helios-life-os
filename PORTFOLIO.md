# HELIOS — Portfolio Case Study

## Executive Summary

HELIOS is a full-stack iOS productivity application demonstrating complete product engineering: mobile-first design, stateless REST API, persistent PostgreSQL backend, and infrastructure-as-code deployment. The project emphasizes working functionality over features — every phase ships tested, documented code to the main branch.

**Completion Status:** V1 Release Candidate (portfolio-demo ready)  
**Development Duration:** 49 phases of incremental delivery  
**Key Achievement:** Production-grade codebase with auth, data persistence, AI integration, and deployment path

---

## The Problem

Modern goal and task management apps often lack intelligence. Users create goals but receive no guidance on execution. This project explores: How can a mobile productivity app deliver personalized AI-assisted planning without requiring subscription infrastructure?

---

## The Solution

HELIOS combines three systems:

1. **Structured Task Hierarchy** — Goals (multi-month targets) and Tasks (weekly sprints) linked by optional foreign keys, enabling flexible goal-task organization while maintaining data integrity via SQL constraints.

2. **Typed Full-Stack Architecture** — TypeScript frontend (Zustand state management, Expo Router file-based nav) communicates with Python backend (FastAPI, Pydantic v2, SQLAlchemy 2.0). Every request/response is validated at both layers.

3. **Pluggable AI Provider** — Abstract base class enables swappable AI backends. Mock provider ships by default (instant feedback for development); switching to OpenAI requires only environment variables, no code changes.

---

## Technical Architecture

### Mobile Layer (React Native / Expo)
- **Framework:** Expo SDK 55, TypeScript strict mode
- **State:** 11 Zustand stores (auth, goals, tasks, analytics, AI, reminders, settings, etc.)
- **Persistence:** Only auth and user preferences persisted to AsyncStorage; data stores reset on logout
- **HTTP:** Custom `apiClient` with 15-second abort timeout, structured error parsing, JWT header injection
- **Features:** Expo Router file-based navigation, SF Symbols icons, haptic feedback, safe area insets

### Backend Layer (FastAPI)
- **Framework:** FastAPI 0.115.4, Python 3.12
- **Validation:** Pydantic v2 request/response schemas
- **ORM:** SQLAlchemy 2.0 with typed columns (`Mapped[]` syntax)
- **Routers:** 11 resource-focused route modules (auth, goals, tasks, analytics, dashboard, agents, AI, conversations, reminders, settings, health)
- **Dependencies:** `get_current_user` on all protected routes, ensuring user-scoped queries

### Database Layer (PostgreSQL)
- **Schema:** 7 tables managed by Alembic migrations
  - `users` (auth credentials, name, email)
  - `goals` (title, status, optional target_date)
  - `tasks` (title, priority, status, optional due_date, optional goal link)
  - `conversations` (user-isolated chat histories)
  - `conversation_messages` (per-message timestamps, sender role)
  - `reminders` (local notification scheduling)
  - `user_preferences` (theme, planning horizon, notification toggles)
- **Constraints:** Foreign keys with CASCADE/SET NULL rules, UUID primary keys, unique email constraint
- **Deployment:** Docker Compose for local dev (bind-mounted source, auto-reload), production Dockerfile with migration runner

### AI Provider Abstraction
- **Base Class:** `AIProvider` abstract base with three methods: `get_briefing()`, `generate_plan()`, `chat()`
- **MockProvider:** Returns hardcoded responses instantly (development/demo)
- **OpenAIProvider:** Full implementation with GPT-4 integration, error handling for all OpenAI error types
- **Context Injection:** Builder pattern passes live user data (current goals, tasks, preferences) to AI prompt context
- **Activation:** Single environment variable `AI_PROVIDER=openai` + `OPENAI_API_KEY` (no code changes needed)

---

## Design Patterns

### 1. Optimistic State Updates
User preferences update the UI instantly while the API call completes in the background. On network failure, the store re-fetches from the server to restore correct state. Users perceive immediate feedback without sacrificing data consistency.

### 2. Selective Persistence
Only two stores persist to AsyncStorage: auth credentials and user preferences. All other stores reset on logout, preventing data leakage between user sessions on shared devices.

### 3. Hydration Guard
Root layout waits for AsyncStorage to finish reading before rendering any screen. Eliminates "flash to login" without blocking the main thread using async/await.

### 4. Ownership Enforcement
Every database query includes `WHERE user_id = current_user.id`. Foreign key fields are validated against the same user before storing — prevents cross-user data linkage even when IDs are known.

### 5. Pluggable AI Backend
Abstract base class + factory function enables switching implementations with a single environment variable. OpenAI provider is complete; adding new backends (Claude, local models) requires only implementing the abstract interface.

---

## Feature Inventory

| Feature | Mobile | Backend | Database | Status |
|---|---|---|---|---|
| Authentication | Login/Signup + persistent sessions | JWT (HS256) + bcrypt | `users` table | ✅ Complete |
| Goals | CRUD with status lifecycle | Full REST API | `goals` + status enum | ✅ Complete |
| Tasks | CRUD with priority/status | Full REST API | `tasks` + priority enum | ✅ Complete |
| Analytics | Live metric tiles | Real-time aggregation | Query-based | ✅ Complete |
| Dashboard | Summary cards | Multi-metric endpoint | Computed on-the-fly | ✅ Complete |
| Reminders | Local notifications + toggles | Reminder CRUD | `reminders` table | ✅ Complete |
| User Preferences | Settings UI (theme, horizon) | Get/Patch endpoints | `user_preferences` | ✅ Complete |
| AI Briefing | Card on home screen | Provider abstraction | Context-builder | ✅ Complete |
| AI Planning | Generate plan from prompt | Multi-step execution | Stateless | ✅ Complete |
| AI Chat | Conversation UI + suggestions | Message storage | `conversations` + `messages` | ✅ Complete |
| AI Actions | One-tap execution | Action handler | Creates tasks/goals | ✅ Complete |

---

## Deployment Model

### Local Development
```bash
docker compose up --build
# Binds source code for live reload
# Database persists to Docker volume
# Backend listens on localhost:8000
```

### Production
```bash
# Backend: Dockerfile runs migrations then starts uvicorn (no reload)
docker build -t helios-api .
docker run -e DATABASE_URL="postgresql://..." -e JWT_SECRET_KEY="..." helios-api

# Mobile: EAS Build with environment-injected API URL
npm run build:ios:prod  # Injects EXPO_PUBLIC_API_URL at build time
```

**Platforms:** Ready for Render, Railway, Fly.io, AWS ECS, or any Docker-capable host.

---

## Testing & Quality

**Backend Tests:** 8/8 passing (auth, goals, tasks, health, version, analytics)  
**Mobile Tests:** 2 suites, 4/4 passing (API client, error boundary)  
**TypeScript:** No compilation errors (strict mode)  
**Security:** All secrets excluded from git, JWT validation on every protected route, password hashing with bcrypt

---

## Known Limitations

| Limitation | Impact | Why | Next |
|---|---|---|---|
| Mock AI provider default | Demo only | Safety + no API cost | Set `AI_PROVIDER=openai` |
| Local notifications only | Reminders not pushed when app closed | Reduces backend complexity | Add remote notifications (v2) |
| 60-minute access tokens | User re-login required after 1hr | No refresh token flow | Implement refresh tokens (v2) |
| iOS only | No Android app | Mobile-first design | Port to Android with same backend (v2) |
| No deep linking | Can't share conversations | Routes not deep-linkable | Define deep link schema (v2) |
| Bundle ID placeholder | Can't submit to App Store | Generic template | Replace with real Apple App ID |

---

## Code Quality Highlights

- **Type Safety:** Pydantic schemas on backend (all data validated at entry), TypeScript strict mode on mobile
- **Error Handling:** All FastAPI routes wrapped with exception handlers, structured error responses for client parsing
- **Modularity:** Resource-focused routers (one file per API entity), service-oriented client (one file per API resource)
- **Documentation:** Every public endpoint documented in FastAPI `docs` (Swagger UI), every component has JSDoc comments
- **Testability:** Full test suite for backend auth/API logic, mobile test suites for API client and error handling
- **Secrets:** Never committed — `.env` in `.gitignore`, only placeholders in `.env.example`

---

## What This Demonstrates

### For Backend Engineers
- Building REST APIs with FastAPI and Pydantic v2
- Designing PostgreSQL schemas with proper constraints and migrations
- Implementing JWT authentication with algorithm allowlisting and timing-safe comparisons
- Using abstract base classes and factory patterns for swappable service implementations
- Containerising Python apps for both local development (live reload) and production

### For Mobile Engineers
- Building multi-screen iOS apps with Expo Router file-based navigation
- Managing complex cross-domain state with Zustand (11 stores, selective persistence)
- Implementing typed HTTP clients with timeout, error handling, and token injection
- Handling iOS UX details (keyboard chaining, safe area insets, haptic feedback, pull-to-refresh)
- Configuring local push notifications with platform permission flows

### For Product Engineers
- Structuring projects for incremental delivery (49 phases, each shipping working code)
- Making honest architectural trade-offs (mock AI provider is documented; limitations listed explicitly)
- Writing comprehensive documentation for deployment, release, and demo workflows
- Balancing feature completeness with portfolio readiness

---

## Getting Started (5 minutes)

**Prerequisites:** Docker Desktop, Node.js 20+, Xcode (for iOS Simulator)

```bash
# 1. Backend startup
cd backend
cp .env.example .env
# Generate strong JWT secret: python3 -c "import secrets; print(secrets.token_hex(32))"
# Paste as JWT_SECRET_KEY in .env
docker compose up --build

# 2. Mobile startup (new terminal)
cd mobile
npm install
npx expo start
# Press i for iOS Simulator

# 3. Demo
# Signup with any email/password
# Create a goal, add tasks, check analytics
# Tap "Agents" to generate an AI plan
# See health check at http://localhost:8000/api/v1/health
```

---

## Files Worth Reading

- [Architecture Deep-Dive](docs/architecture-overview.md) — Database schema, API routes, state stores
- [iOS Release Guide](docs/ios-release.md) — From source to TestFlight submission
- [Deployment Guide](docs/deployment.md) — Backend hosting on Render/Railway/Fly.io
- [Technical Talking Points](docs/technical-talking-points.md) — Interview prep and system design Q&A
- [Post-V1 Backlog](docs/post-v1-backlog.md) — Prioritized next features and improvements

---

## Conclusion

HELIOS is a complete, working portfolio project. It proves you can design, build, test, and ship a full-stack app end-to-end. The codebase is clean, documented, and ready for production deployment or deeper technical interviews.

**Status:** ✅ Portfolio-demo ready. No blockers. All features working. Ready to show.
