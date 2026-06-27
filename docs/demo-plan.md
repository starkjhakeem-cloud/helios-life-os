# HELIOS — Demo Plan

Reference for capturing screenshots, recording a demo video, or running a live demo. Every item listed here is a working feature — nothing is stubbed.

---

## Screenshot Checklist

Capture these screens in the iOS Simulator (or a real device) in order. Light the scene by having meaningful data already loaded — create goals, tasks, and reminders first, then capture.

### Authentication
- [ ] **Login screen** — HELIOS branding, email/password inputs with focus state (cyan border), ACCESS SYSTEM button
- [ ] **Signup screen** — CREATE ACCOUNT form

### Home / Dashboard
- [ ] **Home (loaded state)** — Hero card with greeting + date + system status, metric tiles, AI briefing card with summary and priorities
- [ ] **Home (loading state)** — ActivityIndicator and "LOADING INTELLIGENCE..." label

### Goals
- [ ] **Goals list (with data)** — Active goals with status icons (cyan circle), completed goal with strikethrough text, OBJECTIVES header + NEW GOAL button
- [ ] **Goals empty state** — Target SF Symbol icon + placeholder text
- [ ] **New Goal modal** — Sheet with GOAL TITLE, DESCRIPTION, TARGET DATE inputs; focused input showing cyan border; CREATE / CANCEL buttons

### Tasks
- [ ] **Tasks list (with data)** — Cards showing priority bar (red/orange/yellow), status icons, priority chips; open and completed sections
- [ ] **Tasks empty state** — Checklist SF Symbol icon + placeholder text
- [ ] **New Task modal** — Sheet with title, description, priority selector (MEDIUM highlighted), DUE DATE, LINK TO GOAL horizontal scroll

### Analytics
- [ ] **Analytics (with data)** — Goal completion tile (e.g. "2"), task completion tile, stat bars showing progress percentages; COMPLETION RATES and TASK BREAKDOWN cards
- [ ] **Analytics empty state** — Chart bar icon + "Create goals and tasks to see your performance analytics"

### AI (Agents + Planner)
- [ ] **Agents screen** — Five agent cards (STRATEGY, FINANCE, STUDY, HEALTH, CAREER), each showing role and priority badge
- [ ] **AI Planner** — Plan prompt input, GENERATE PLAN button, horizon selector

### AI Assistant
- [ ] **Chat (conversation)** — Message bubbles showing user and assistant messages, follow-up question chips below assistant message, recommended action card with action type badge
- [ ] **AI action card** — "Create Task" or "Create Goal" recommendation with EXECUTE button
- [ ] **Chat input** — Text input with SEND button, keyboard visible

### Profile
- [ ] **Profile top** — Avatar with initials, display name, email; ACCOUNT card with member since + user ID
- [ ] **Notifications card** — Permission status with GRANTED indicator
- [ ] **Reminders section** — List of reminders showing title, time (e.g. "Today 9:00 AM"), ON/OFF toggle, delete button
- [ ] **New Reminder modal** — Bottom sheet with title, note, REMIND AT inputs
- [ ] **Preferences section** — Theme picker (SYSTEM / DARK / LIGHT), Plan Horizon (7D highlighted), Notification toggles

---

## Demo Video Walkthrough Script

**Target length:** 3–5 minutes. Capture at 1×, no fast-forward.

### Opening (15 seconds)
Show the home screen already loaded with real data. Let it sit for a moment so the viewer takes in the design.

### 1 — Authentication (30 seconds)
Sign out (to show the flow), then sign back in. Demonstrate:
- Login screen design and branding
- Typing in email/password — show keyboard chaining (tap Next on email, lands on password field automatically)
- Tap ACCESS SYSTEM — loading spinner, then navigate to Home

**Talking point:** "Sessions persist across app restarts via AsyncStorage. On every cold start the app revalidates the token against `/auth/me` before rendering any tab."

### 2 — Goals and Tasks (60 seconds)
Navigate to Goals.
- Pull down to trigger refresh (pull-to-refresh)
- Tap the circle icon on an active goal — it cycles to Completed (haptic + icon changes to checkmark)
- Tap NEW GOAL — sheet slides up, title input auto-focuses
- Type a goal title, add a target date — show the cyan focus border on the active input
- Tap CREATE — goal appears in the list

Navigate to Tasks.
- Show a task card with a red priority bar (CRITICAL) vs a yellow one (MEDIUM)
- Tap the status icon — cycles through todo → in_progress → done (haptic feedback each time)
- Tap NEW TASK — show the priority selector chips and the goal-linking scroll

**Talking point:** "Every write goes to the FastAPI backend, stored in PostgreSQL, and comes back as the updated resource. There are no local-only mutations."

### 3 — Analytics (30 seconds)
Navigate to Analytics.
- Show the four stat tiles (completed goals, completion rate, total tasks, overdue)
- Show the completion rate progress bars
- Pull to refresh — spinner appears and data reloads

**Talking point:** "These numbers are computed live in SQL at request time — no pre-aggregated caches, no stale data."

### 4 — AI Features (90 seconds)
Navigate to Agents.
- Show the five agent profile cards briefly
- Scroll to the AI Planner section
- Enter a plan prompt: "Launch a mobile app side project in 60 days"
- Tap GENERATE PLAN — show the loading state, then the structured plan with titled steps and day targets

Navigate to the Assistant tab.
- Send a message: "What should I focus on today?"
- Show the AI response with the briefing-style reply
- Tap a follow-up question chip — it auto-fills the input and sends
- Show a recommended action card appearing — type "Create Task", with a brief description

**Talking point:** "The AI layer is abstracted behind a provider interface. Currently using a mock provider for deterministic demos. Switching to real GPT requires one environment variable change."

### 5 — Reminders and Settings (45 seconds)
Navigate to Profile.
- Scroll to the Notifications section — show permission status
- Scroll to the Reminders section — show a reminder with a future time, tap the toggle to disable/enable it
- Tap NEW — bottom sheet for creating a reminder
- Scroll to Preferences — show the theme picker and planning horizon selector, tap 14D to change it (isSaving indicator appears)

**Talking point:** "Preferences are persisted to PostgreSQL and synced to AsyncStorage on login, so they load instantly on every cold start."

### Closing (15 seconds)
Return to the Home screen. Let it sit.

---

## Live Demo Setup

Before a live demo or recording session:

1. **Create sample data** (takes 5 minutes):
   - 3 goals: "Launch HELIOS v1", "Ship portfolio by end of month", "Complete TypeScript certification"
   - 5–6 tasks across different priorities; mark some as done
   - 2–3 reminders with future dates

2. **Verify backend is running:**
   ```bash
   curl http://localhost:8000/api/v1/health
   ```

3. **Simulator settings:**
   - Device: iPhone 16 Pro (recommended for screenshots)
   - Scale: 100% (or fit to screen)
   - Status bar: hide the time or set to 9:41 (classic Apple screenshot convention)

4. **Things to avoid during demo:**
   - Don't trigger a network error — keep the backend running
   - Don't show the profile screen before having reminders set up — the empty state is fine, but a populated state looks better

---

## Key Talking Points by Audience

### For backend engineers
- SQLAlchemy 2.0 ORM with typed `Mapped[]` columns
- Pydantic v2 validation with `Literal` types and `field_validator` for email normalisation
- All queries scoped to `current_user.id` — cross-user access enforced at the ORM layer
- 6 Alembic migrations with proper FK constraints and `CASCADE`/`SET NULL` rules
- AI provider abstraction: `AIProvider` abstract base → `get_ai_provider()` factory → swappable implementations

### For mobile/frontend engineers
- Expo Router file-based navigation with dual auth guards
- 11 Zustand stores: selective persistence (auth + settings only), `reset()` on all stores at logout
- `forwardRef` on `Input` enables keyboard chaining via `ref.current?.focus()` in `onSubmitEditing`
- Optimistic updates in `useSettingsStore` with server rollback on failure
- Expo Notifications permission flow and local notification scheduling

### For full-stack generalists
- Monorepo structure: `backend/` and `mobile/` are fully independent — no shared code or build steps
- Production Dockerfile runs Alembic migrations then starts Uvicorn; `docker-compose.yml` overrides CMD for `--reload` in dev
- `EXPO_PUBLIC_API_URL` selects the backend for physical devices, staging, and production builds

---

## Screenshot Filename Conventions

```
screenshots/
  01-login.png
  02-home-loaded.png
  03-home-loading.png
  04-goals-list.png
  05-goals-empty.png
  06-new-goal-modal.png
  07-tasks-list.png
  08-tasks-empty.png
  09-new-ta<API_KEY>
  10-analytics.png
  11-analytics-empty.png
  12-agents.png
  13-ai-planner-result.png
  14-assistant-chat.png
  15-assistant-action-card.png
  16-profile-top.png
  17-reminders.png
  18-new-reminder.png
  19-preferences.png
```

Place screenshots in `docs/screenshots/` and update the README Screenshots section with the actual images.
