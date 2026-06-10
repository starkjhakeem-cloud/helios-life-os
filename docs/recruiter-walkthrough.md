# HELIOS — Recruiter Walkthrough Guide

A practical guide for presenting HELIOS to recruiters, hiring managers, and non-technical stakeholders. This file is intentionally honest: it highlights what works, what is ready, and what remains in the backlog.

---

## What It Is

**HELIOS is a full-stack iOS productivity app built with React Native, Expo, FastAPI, and PostgreSQL.** It is a portfolio project designed to demonstrate complete product engineering from database design through mobile UX and backend services.

**What is working today:**
- JWT-authenticated mobile login/signup with persistent sessions
- Goals and tasks CRUD with live analytics
- AI planning, assistant chat, and action recommendations
- Reminders and local notifications
- Persistent user preferences synced to PostgreSQL
- Backend API documentation at `localhost:8000/docs`

---

## Short Summary

**For recruiters:** HELIOS is not a prototype or a UI mockup. It is a working, deployable codebase with a mobile app, a Dockerised backend, and a database migration history.

**For engineers:** The project demonstrates typed front-end state management, a FastAPI REST API with Pydantic validation, SQLAlchemy ORM, Alembic migrations, and an AI integration pattern that separates interface from implementation.

---

## One-Sentence Pitch

HELIOS is a flagship portfolio app that combines goals, tasks, analytics, reminders, and AI support into a full-stack mobile experience.

---

## Non-Technical Elevator Pitch

"HELIOS is a mobile app where users manage goals, tasks, and reminders, and receive AI-driven planning suggestions. The backend is a Python API running in Docker and connected to PostgreSQL, while the mobile app is built with React Native and Expo. It is designed to be a complete product, not just a demo."

---

## Why This Project Matters

- It proves you can ship a full-stack app end-to-end.
- It shows practical experience with mobile UX, backend APIs, security, and data persistence.
- It demonstrates the discipline of shipping in phases with working demos at every step.

---

## What the Project Demonstrates

| Domain | Evidence in HELIOS |
|---|---|
| Mobile engineering | 7-tab Expo Router app, 11 Zustand stores, TypeScript strict mode, keyboard chaining, pull-to-refresh, modal auto-focus |
| Backend engineering | FastAPI + Pydantic v2, JWT auth, rate-limited auth routes, ownership-scoped queries, Swagger docs |
| Database design | PostgreSQL 16, 6 Alembic migrations, FK constraints, cascade rules, 1-to-1 user preferences model |
| AI integration | AI provider abstraction with mock and OpenAI implementations, structured prompt templates, action recommendation flow |
| Deployment readiness | Docker Compose for local development, production Dockerfile with Alembic migration startup |
| Documentation | README, architecture overview, demo scripts, recruiter guide, screenshot guide, technical talking points |

---

## How to Present It by Role

### Mobile recruiter

Focus on:
- React Native + Expo app architecture
- 7-tab UX with modal forms and native-like behavior
- State management using Zustand with selective persistence
- UI polish: focus rings, haptics, safe area insets, notification toggles

### Backend recruiter

Focus on:
- FastAPI REST API design with 11 routers
- JWT auth, bcrypt password hashing, rate limiting
- PostgreSQL schema with Alembic migrations
- AI provider strategy pattern and typed request/response models

### Full-stack or generalist recruiter

Focus on:
- End-to-end ownership from database schema to mobile UX
- Incremental delivery with 43 phases of working code
- The way the mobile app, backend, and database all fit together

---

## What to Show in a Live Walkthrough

1. Login/signup flow
2. Home dashboard with live metrics
3. Goals list and create flow
4. Tasks list and status updates
5. Analytics with live aggregation
6. AI Planner and AI Assistant
7. Reminders and preferences
8. Backend API docs at `localhost:8000/docs`

---

## Honest Limitations

- The app is not yet released to the App Store or TestFlight.
- The JWT is persisted in AsyncStorage, not in iOS Keychain.
- There are no refresh tokens yet; sessions expire after 60 minutes.
- The default AI provider is the mock provider for predictable demo output.
- The UI still uses plain text date fields instead of native date pickers.
- No automated tests are included yet.

---

## Common Recruiter Questions

**"Is this a prototype or real code?"**
"It is a real codebase. The backend is a working FastAPI service, the database is PostgreSQL with migrations, and the mobile app is a React Native app running in Expo."

**"Can this be deployed?"**
"Yes. The backend is Docker-ready, and the mobile app is configured for Expo EAS builds. What is not done yet is the App Store release process itself."

**"What would you improve next?"**
"The next priorities are: switch JWT storage to secure storage, add refresh tokens, and activate the OpenAI provider with a real API key."

**"Is the AI real?"**
"The AI integration is real, but the demo uses a deterministic mock by default. The OpenAI provider implementation is complete and can be enabled with `AI_PROVIDER=openai` and `OPENAI_API_KEY`."

---

## Future Roadmap

**Phase 43** — Finalize the portfolio demo package: polished docs, screenshot checklist, and a recorded walkthrough.

**Phase 44** — Activate the OpenAI provider and confirm the full AI experience with a real key.

**Phase 45** — Configure a real iOS bundle identifier and run Expo EAS builds for TestFlight readiness.

**Phase 46** — Replace the splash/icon assets with App Store-safe versions and capture the final screenshot set.

---

## How to Frame It

Use the phrase: “HELIOS is a working, end-to-end portfolio project with a mobile app, a backend API, and a persistent database. It is production-quality in architecture, with documented limitations and a clear next roadmap.”
