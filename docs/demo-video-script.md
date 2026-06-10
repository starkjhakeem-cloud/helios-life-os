# HELIOS — Demo Video Script

A polished package for recording and presenting HELIOS as a flagship portfolio project. This file contains the 2-minute quick demo, the 5-minute technical walkthrough, the feature demo order, and the backend/API demo order.

---

## Recording Setup

**Before recording:**
1. Start the backend and verify `http://localhost:8000/api/v1/health` responds.
2. Seed the demo account using `docs/screenshot-guide.md`.
3. Open the iOS Simulator: iPhone 16 Pro, scale 100%, clean status bar.
4. Close notification banners and hide the keyboard.
5. Use QuickTime screen recording for crisp 1080p capture.

**Pro tip:** Capture the same sequence twice: once for the visuals-only 2-minute script, once for the narrated 5-minute walkthrough.

---

## 2-Minute Quick Demo

*Best for portfolio reels, social posts, and short demo videos.*

### 0:00–0:10 — Opening
- Show Home with live metrics and AI briefing card.
- Let the app settle so the viewer sees layout and data.

### 0:10–0:35 — Goals + Tasks
- Tap Goals.
- Complete an active goal via the status icon.
- Open NEW GOAL, type a title, and create it.
- Tap Tasks.
- Cycle a task through todo → in_progress → done.

### 0:35–0:55 — AI Features
- Tap Agents.
- Enter a prompt in the planner and tap GENERATE PLAN.
- Show the generated plan.
- Tap Assistant.
- Send "What should I focus on today?"
- Show the response and a recommended action card.

### 0:55–1:15 — Reminders + Preferences
- Tap Profile.
- Show reminders with toggles.
- Open Preferences and switch the planning horizon.

### 1:15–1:40 — Analytics + API Proof
- Tap Analytics and show live metric tiles.
- Open browser to `http://localhost:8000/docs` and expand `/goals`.

### 1:40–2:00 — Closeout
- Return to Home.
- End with a clean dashboard shot.

---

## 5-Minute Technical Walkthrough

*For recruiter calls, engineering interviews, or a deeper demo.*

### 0:00–0:15 — Intro
**Show:** Home screen.
**Say:** "This is HELIOS — a full-stack productivity app built with React Native, Expo, FastAPI, and PostgreSQL. The mobile app uses a real backend and stores data persistently."

### 0:15–0:45 — Authentication
**Show:** Profile → Sign Out → Login.
**Say:** "Authentication uses JWT and bcrypt. Sessions persist locally and are revalidated with `/auth/me` on cold start."
**Say:** "Signup and login are rate-limited to prevent abuse."

### 0:45–1:30 — Goals and Tasks
**Show:** Goals.
**Say:** "Goals and tasks are persisted in PostgreSQL. Deleting a goal safely unlink tasks with SET NULL."
**Show:** Create a goal and cycle task status.
**Say:** "Every mutation is sent to the API immediately — no local-only persistence."

### 1:30–2:15 — Analytics + Dashboard
**Show:** Analytics, then Home.
**Say:** "Metrics are computed live in SQL. Pull to refresh demonstrates the live update."

### 2:15–3:15 — AI System
**Show:** Agents + Planner.
**Say:** "The AI layer is abstracted behind an interface. The mock provider is used for deterministic demos; the OpenAI provider is implemented and can be enabled with environment variables."
**Show:** Assistant and action card.
**Say:** "Conversation history is persisted to PostgreSQL, and the assistant can recommend actions like creating tasks."

### 3:15–3:45 — Reminders and Preferences
**Show:** Profile → Reminders → Preferences.
**Say:** "Reminders are scheduled locally with Expo Notifications. Preferences sync to the server and persist across sessions."

### 3:45–4:15 — Backend & API
**Show:** Browser to `http://localhost:8000/docs`.
**Say:** "FastAPI auto-generates API docs from Pydantic schemas. The same backend powers the mobile app."

### 4:15–4:45 — Reliability and Security
**Say:** "Auth routes are rate-limited, and every protected API query filters by `current_user.id`. Cross-user data access is prevented at the backend."

### 4:45–5:00 — Close
**Show:** Home.
**Say:** "HELIOS is designed as a flagship portfolio project: full-stack, documented, and demo-ready. The remaining work is release polish and deployment."

---

## Feature Demo Order

1. Authentication
2. Home dashboard
3. Goals
4. Tasks
5. Analytics
6. AI Planner
7. AI Assistant
8. Reminders
9. Preferences
10. Backend API docs

---

## Backend/API Demo Order

1. `POST /auth/signup`
2. `POST /auth/login`
3. `GET /auth/me`
4. `GET /goals`, `POST /goals`, `PATCH /goals/{id}`, `DELETE /goals/{id}`
5. `GET /tasks`, `POST /tasks`, `PATCH /tasks/{id}`, `DELETE /tasks/{id}`
6. `GET /analytics/summary`
7. `POST /ai/briefing`, `POST /ai/plan`, `POST /ai/chat`, `POST /ai/actions/execute`
8. `GET /reminders`, `POST /reminders`, `PATCH /reminders/{id}`
9. `GET /settings/preferences`, `PATCH /settings/preferences`

---

## Notes

- Do not claim App Store or TestFlight release unless completed.
- Do not claim real GPT responses unless `AI_PROVIDER=openai` and `OPENAI_API_KEY` are configured.
- The OpenAI provider is implemented and ready to enable with environment variables.
- Record the 2-minute and 5-minute versions separately for clarity.

- Portfolio site: Both versions, embed or link
- Interview email: Link to the 5-minute version with a timestamp note ("AI section starts at 2:15")

**Caption for LinkedIn post:**
```
HELIOS — full-stack iOS productivity app built in 43 incremental phases.

Stack: React Native / Expo SDK 55 · FastAPI (Python) · PostgreSQL 16 · Docker

Features shipped:
→ JWT auth with rate limiting + account deletion
→ Goals, tasks, analytics (live SQL aggregation)
→ AI assistant, planner, and briefing (mock + OpenAI provider)
→ Persistent conversation history
→ Local push notifications via Expo
→ User preferences persisted to PostgreSQL

Open to full-stack, mobile, or backend roles.

#ReactNative #FastAPI #TypeScript #Python #iOS #SoftwareEngineering
```
