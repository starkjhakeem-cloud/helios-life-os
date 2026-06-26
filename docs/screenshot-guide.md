# HELIOS — Screenshot Guide

A precise, ordered checklist for capturing portfolio-quality app screenshots and demo materials.

---

## Simulator Setup

1. Device: **iPhone 16 Pro**.
2. Scale: **100% / Physical Size** for crisp screenshots.
3. Status bar: clean and minimal.
   - Use Simulator → Features → Toggle In-Call Status Bar
   - Or run: `xcrun simctl status_bar booted override --time "9:41"`
4. Output: save screenshots to `docs/screenshots/`.
5. Close notification banners and hide the keyboard before each capture.

---

## Data Seeding

Seed the demo account before opening the app. This gives every screen meaningful content.

```bash
BASE=http://localhost:8000/api/v1

TOKEN=$(curl -s -X POST $BASE/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Alex Chen","email":"demo@helios.app","password":"helios2026"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

echo "Token: ${TOKEN:0:20}..."

# Goals
G1=$(curl -s -X POST $BASE/goals -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Launch HELIOS v1 portfolio","status":"active","target_date":"2026-08-01"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
G2=$(curl -s -X POST $BASE/goals -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Complete TypeScript certification","status":"active","target_date":"2026-07-15"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
G3=$(curl -s -X POST $BASE/goals -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Read 12 engineering books this year","status":"completed"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Goals: $G1 $G2 $G3"

# Tasks
curl -s -X POST $BASE/tasks -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Write architecture overview doc\",\"priority\":\"high\",\"status\":\"done\",\"linked_goal_id\":\"$G1\"}" -o /dev/null
curl -s -X POST $BASE/tasks -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Record portfolio demo video\",\"priority\":\"critical\",\"status\":\"in_progress\",\"linked_goal_id\":\"$G1\"}" -o /dev/null
curl -s -X POST $BASE/tasks -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Deploy backend to Render\",\"priority\":\"high\",\"status\":\"todo\",\"linked_goal_id\":\"$G1\",\"due_date\":\"2026-06-15\"}" -o /dev/null
curl -s -X POST $BASE/tasks -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Complete Module 4: Advanced Types\",\"priority\":\"medium\",\"status\":\"done\",\"linked_goal_id\":\"$G2\"}" -o /dev/null
curl -s -X POST $BASE/tasks -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"title\":\"Practice interview system design\",\"priority\":\"medium\",\"status\":\"todo\"}" -o /dev/null

echo "Tasks created"

# Reminders
curl -s -X POST $BASE/reminders -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Review weekly goals","body":"Check progress on active goals","remind_at":"2026-06-02T09:00:00Z","is_enabled":true}' -o /dev/null
curl -s -X POST $BASE/reminders -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Portfolio review with mentor","remind_at":"2026-06-05T14:00:00Z","is_enabled":true}' -o /dev/null

echo "Reminders created"
echo "Done. Log in with demo@helios.app / helios2026"
```

---

## Feature Demo Order

Capture the app in this sequence so the flow makes narrative sense.

1. Login
2. Dashboard
3. Goals
4. Tasks
5. Analytics
6. AI Planner
7. AI Assistant
8. Reminders
9. Preferences
10. Backend docs

---

## Screenshot Checklist

### 01 — Login
- File: `docs/screenshots/01-login.png`
- Show the login form with email/password fields and branded header.
- Tap the email field so the focus state is visible.

### 02 — Home Dashboard
- File: `docs/screenshots/02-home-loaded.png`
- Show greeting, metric tiles, and AI briefing card.
- Pull to refresh once before capture.

### 03 — Goals List
- File: `docs/screenshots/03-goals-list.png`
- Show active goals, a completed goal, and status icons.

### 04 — New Goal Modal
- File: `docs/screenshots/04-new-goal-modal.png`
- Show the modal with the title input focused.
- Do not save the demo goal unless it fits the seeded data.

### 05 — Goals Empty State
- File: `docs/screenshots/05-goals-empty.png`
- Use a second demo account or temporary cleared data.

### 06 — Tasks List
- File: `docs/screenshots/06-tasks-list.png`
- Show multiple priorities and status chips.

### 07 — New Task Modal
- File: `docs/screenshots/07-new-ta<API_KEY>`
- Show title, priority selector, due date, and goal link controls.

### 08 — Analytics
- File: `docs/screenshots/08-analytics.png`
- Show stat tiles and progress bars.

### 09 — Analytics Empty State
- File: `docs/screenshots/09-analytics-empty.png`
- Show placeholder text when no data exists.

### 10 — Agents
- File: `docs/screenshots/10-agents.png`
- Show the five AI agent cards and role badges.

### 11 — AI Planner Result
- File: `docs/screenshots/11-ai-planner-result.png`
- Show a generated plan with step headings.

### 12 — Assistant Chat
- File: `docs/screenshots/12-assistant-chat.png`
- Show a user message, assistant response, and follow-up chips.

### 13 — AI Action Card
- File: `docs/screenshots/13-assistant-action-card.png`
- Show the recommended action card with the EXECUTE button.

### 14 — Profile Top
- File: `docs/screenshots/14-profile-top.png`
- Show the avatar, name, email, and account info.

### 15 — Reminders
- File: `docs/screenshots/15-reminders.png`
- Show scheduled reminders and toggles.

### 16 — New Reminder Modal
- File: `docs/screenshots/16-new-reminder-modal.png`
- Show the reminder sheet with title and time fields.

### 17 — Preferences
- File: `docs/screenshots/17-preferences.png`
- Show theme, planning horizon, and notification toggles.

### 18 — Backend API Docs
- File: `docs/screenshots/18-api-docs.png`
- Show `localhost:8000/docs` and an expanded route group.

### 19 — Architecture Diagram
- File: `docs/screenshots/19-architecture.png`
- Optional: screenshot the architecture overview in a code editor.

---

## After Capture

1. Move screenshots into `docs/screenshots/`.
2. Verify filenames and image quality.
3. Update `README.md` with the actual screenshots.
4. Save a copy of the 2-minute and 5-minute videos with names like `helios-demo-2min.mp4` and `helios-demo-5min.mp4`.

---

## Backend/API Demo Order

If you want to include backend visuals, capture these endpoints in this order:

1. `/auth` — login/signup/me
2. `/goals` — CRUD
3. `/tasks` — CRUD
4. `/analytics` — live summary
5. `/ai` — briefing/plan/chat
6. `/reminders` — list and toggle
7. `/settings/preferences` — GET and PATCH
