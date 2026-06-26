# HELIOS V2 — Demo Guide

**Version:** V2 Final Completion Pass  
**Date:** 2026-06-12  
**Audience:** Portfolio demos, recruiter walkthroughs, personal showcase

> **Important:** This guide distinguishes between features that use real infrastructure and features that return simulated data. Never claim real Google API calls are happening — the integration screens are architecture demonstrations.

---

## Pre-Demo Setup

### 1. Start the backend
```bash
cd backend
docker compose up --build
```

Verify: `curl http://localhost:8000/api/v1/health` → `{"status":"ok",...}`

### 2. Start the mobile app
```bash
cd mobile
npx expo start
# Press i for iOS Simulator
```

### 3. Create a demo account
- Open the app → tap **CREATE ACCOUNT**
- Name: `Demo Operator` (or your name)
- Email: any valid format
- Password: at least 6 characters

---

## Demo Flow (8–10 minutes)

### Part 1: Goals & Tasks (2 min) — REAL DATA

**Show:** The core productivity layer backed by PostgreSQL.

1. Navigate to **Goals** tab
2. Tap **+** → create a goal: *"Ship HELIOS V2 to production"*
3. Navigate to **Tasks** tab
4. Tap **+** → create a task: *"Write V2 completion report"*, priority **HIGH**, linked to your goal
5. Create one more task: *"Deploy to Render"*, priority **MEDIUM**
6. Change one task status to **IN PROGRESS**

**Talking point:** *"Goals and tasks are fully CRUD — PostgreSQL-backed, user-scoped, JWT-protected. Priority, status, and due dates all persisted. The analytics screen updates in real-time from these records."*

---

### Part 2: Analytics (1 min) — REAL DATA

1. Navigate to **Analytics** tab
2. Show completion rates, task breakdown bars, overdue count

**Talking point:** *"Analytics are computed live at request time — no caching layer, no materialized views. SQL aggregation per request. Instant refresh on pull-down."*

---

### Part 3: AI Assistant (2 min) — CONFIGURABLE (mock by default)

1. Navigate to **Assistant** tab
2. Tap one of the follow-up chips: *"What should I focus on today?"*
3. Toggle **CONTEXT** on — point out the cyan banner
4. Ask: *"What are my most critical tasks this week?"*
5. If a recommended action appears, tap **REVIEW** to show the action modal

**Talking point:** *"The assistant uses a provider abstraction pattern. With `AI_PROVIDER=mock` it returns structured deterministic responses — no external calls. Set `AI_PROVIDER=openai` and it hits the OpenAI API with the same interface. The context toggle injects live goals, tasks, and memory into each message."*

**If asked about conversation history:** Tap **HISTORY** to show the conversation list.

---

### Part 4: AI Memory (1.5 min) — REAL DATA

1. Navigate to **Memory** tab
2. Tap **+** to add a memory
3. Select type **PREFERENCE**, content: *"Always prioritize momentum over perfection"*
4. Add another: type **GOAL CONTEXT**, content: *"HELIOS V2 ships end of Q2"*
5. Filter by type using the chips

**Talking point:** *"Memory is persistent — stored in PostgreSQL, injected into every AI prompt. The AI sees this LONG-TERM MEMORY section in every message. This is real infrastructure, not simulated."*

---

### Part 5: Agents & Orchestration (1.5 min) — CONFIGURABLE

1. Navigate to **Agents** tab
2. Show active agents (Strategy, Finance, Study, Health, Career)
3. Tap any agent card to expand and show its context package
4. Scroll down to **ORCHESTRATE**
5. Enter objective: *"Build a 30-day execution plan for launching HELIOS to production"*
6. Tap **ORCHESTRATE**

**Talking point:** *"Five specialized agents each get their own domain-filtered context package — goals/tasks/memories scoped to their domain. Orchestration calls the AI provider once per selected agent and assembles a unified response with prioritized recommended actions."*

---

### Part 6: Integrations (2 min) — ARCHITECTURE DEMO

> **Key framing:** Present this as an architecture demonstration, not a live integration.

1. Navigate to **Integrations** tab (swipe right on the Home tab or navigate from Profile)
2. Show the four provider cards: Google Calendar, Gmail, Outlook Calendar, Outlook Mail
3. Tap **MOCK CONNECT** on Google Calendar → watch the status change to connected
4. Tap **SYNC** → show the sync timestamp update
5. Point out the Outlook providers show only MOCK CONNECT (no real OAuth path)

**Talking point:** *"This demonstrates the full V2 integration architecture. The token storage layer uses Fernet AES-128-CBC encryption — the same algorithm used in production by tools like Airflow and HashiCorp Vault. The mock connect writes a real database row with pre-populated OAuth scopes. A real sync would call the Google Calendar adapter, which is wired end-to-end but gated by a `_STUB=True` flag. Flipping that flag and adding Google Cloud credentials activates real data — no schema changes needed."*

**If asked about real OAuth:** *"The OAuth token exchange is complete — authorization URL generation, PKCE foundation, encrypted token storage, and adapter wiring are all implemented. We're waiting on GCP credentials and a state-persistence layer (CSRF protection) before activating the real path."*

---

### Part 7: Profile & Settings (30 sec)

1. Navigate to **Profile** tab
2. Show theme preference toggle, planning horizon, notification toggle
3. Mention reminders section — create one to show local push notification scheduling

---

## Key Technical Talking Points

### "Is any of this real?"

| Layer | Answer |
|-------|--------|
| Auth (JWT, bcrypt) | 100% real |
| Goals, Tasks, Analytics | 100% real PostgreSQL |
| AI Memory | 100% real PostgreSQL |
| AI responses (briefing, chat, plan) | Mock by default; real with OpenAI env var |
| Google OAuth flow | Architecture wired; stub tokens only |
| Calendar / Gmail data | Fixture data; no Google API calls |
| Sync simulation | Deterministic fake records written to real DB tables |

### "Why stubs instead of live data?"

*"Live Google OAuth requires app-review-approved GCP credentials and a production redirect URI. The architecture is complete — adapters, token encryption, DB schema, and mobile OAuth flow are all in place. The stub flag is a one-line flip once credentials are configured."*

### "What would it take to go live?"

*"Four things: GCP credentials in `.env`, a state-persistence layer for CSRF protection (Redis or a DB table), a mobile deep-link handler using `expo-web-browser` (already installed), and a token refresh service. The V2.21 doc covers all of these step-by-step."*

### "How do you handle token security?"

*"Tokens are encrypted with Fernet (AES-128-CBC + HMAC-SHA256) before touching the database. The `IntegrationOut` schema never exposes token columns. The logs never contain token values — only `type(exc).__name__` on decryption failures. The encryption key lives only in `.env`, never in tracked files."*

---

## What NOT to Say

- Do **not** say *"it syncs your Google Calendar"* — it writes fixture data to a `calendar_events` table
- Do **not** say *"the AI reads your emails"* — Gmail data is stub fixture records
- Do **not** say *"the OAuth is live"* — stub tokens only until credentials are configured
- Do **not** demo the CONNECT GOOGLE button (non-mock path) — it will show an unconfigured-credentials warning

---

## Fallback Scenarios

### Backend won't start
```bash
cd backend
docker compose down -v
docker compose up --build
```

### Mobile can't reach backend
- Check that `localhost:8000` responds
- In `mobile/src/config/api.ts`: if on physical device, change `BASE_URL` to your local IP

### AI responses look generic
That's expected — `AI_PROVIDER=mock` is the default. To show real OpenAI responses:
1. Add `AI_PROVIDER=openai` and `OPENAI_API_KEY=<OPENAI_API_KEY>` to `backend/.env`
2. Restart: `docker compose restart api`

### Integration sync shows no data change
The sync writes to `calendar_events` and `email_messages` tables — these don't surface in the UI yet (planned for V3). Point to the sync timestamp update and `sync_jobs` table as the evidence.
