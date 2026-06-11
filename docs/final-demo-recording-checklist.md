# HELIOS — Final Demo Recording Checklist

**Phase:** 52 | **Use this file:** day-of recording, before every session

Work through each section top to bottom. All boxes must be checked before pressing record.

---

## 1. Environment — At Least 10 Minutes Before Recording

### Backend (Docker)

```bash
# From the repo root
cd backend

# Clean start (use this if any prior session ended abnormally)
docker compose down -v && docker compose up --build

# Fast restart if environment is known-clean
docker compose up
```

Watch the log output for these two lines before proceeding:

```
db       | database system is ready to accept connections
api      | Application startup complete.
```

The API service runs `alembic upgrade head` before starting. Confirm it completes without error:

```
INFO  [alembic.runtime.migration] Running upgrade ... -> 006, ...
```

- [ ] Docker Desktop is running
- [ ] `docker compose up` completed without errors
- [ ] Both `db` and `api` containers show as healthy in Docker Desktop
- [ ] Log shows `Application startup complete.`

### Backend Health Check

```bash
curl http://localhost:8000/api/v1/health
# Expected: {"status":"ok","service":"helios-api","timestamp":"..."}
```

- [ ] `/health` returns `{"status":"ok"}`

### Swagger UI (Browser Check)

Open **[http://localhost:8000/docs](http://localhost:8000/docs)** in a browser.

- [ ] Swagger UI loads with the HELIOS API title
- [ ] `/api/v1/auth/signup`, `/api/v1/goals`, `/api/v1/tasks`, `/api/v1/ai/plan` are visible in the route list
- [ ] No 502 or "Failed to fetch" error in the browser console

---

## 2. iOS Simulator

### Launch and configure

1. Open Xcode → Xcode menu → Open Developer Tool → Simulator (or `open -a Simulator`)
2. Select device: **iPhone 16 Pro** (or iPhone 15 Pro if 16 Pro is unavailable)
3. Once the simulator is booted, start the Expo dev server:

```bash
cd mobile
npx expo start --ios --clear
```

Wait for Metro bundler to finish (`› Web is waiting on http://localhost:8081`) then for the app to load on the simulator.

- [ ] Simulator is running iPhone 16 Pro (or equivalent)
- [ ] Metro bundler started without errors
- [ ] HELIOS app is visible and has loaded (login or home screen — not a blank white screen)
- [ ] No red error overlay visible in the simulator
- [ ] Status bar shows a clean time (no notification badges)

### Simulator display settings (optional but recommended)

- Set simulator time to **9:41** (classic iOS screenshot convention): `xcrun simctl status_bar booted override --time "9:41"`
- Hide status bar battery percentage if visible
- Set simulator window scale to **100%** (Window → Physical Size)

---

## 3. Account and Data Setup

### Create the demo account

If recording on a fresh database, create the demo account first:

1. Tap **CREATE ACCOUNT** on the signup screen
2. Fill in:
   - Name: `Alex Morgan` (or any two-word name — initials display in the avatar)
   - Email: `alex@helios.demo`
   - Password: at least 8 characters (not shown during recording)
3. Confirm the app navigates to the Home dashboard after signup

- [ ] Demo account created (or already exists from a previous session)
- [ ] Login works: sign out and sign back in to confirm the full login flow

### Seed demo data

Before recording, populate the account so every screen looks complete. Minimum required:

**Goals (3):**
| Title | Status |
|---|---|
| Launch HELIOS v1 | active |
| Complete system design course | active |
| Ship portfolio by end of month | completed |

**Tasks (5–6):**
| Title | Priority | Status |
|---|---|---|
| Write backend tests for auth routes | critical | in_progress |
| Update README deployment section | medium | todo |
| Record demo video | high | todo |
| Fix analytics query performance | medium | todo |
| Review pull request feedback | low | done |
| Set up CI workflow | high | done |

**Reminders (2):**
| Title | Remind At |
|---|---|
| Daily standup review | Any future date/time |
| Weekly goal check-in | Any future date/time, different day |

**Preferences:**
- Theme: Dark (default)
- Planning Horizon: 7 days

- [ ] Goals seeded (2 active, 1 completed)
- [ ] Tasks seeded (mix of priorities and statuses)
- [ ] Reminders seeded (2, with future dates)
- [ ] Home screen shows the AI briefing card (not loading or error state)

---

## 4. Screen and Recording Setup

### Simulator position
- Move the simulator window to the centre of the screen
- Close any unrelated windows behind it
- Hide the Dock (System Settings → Dock → Automatically hide)

### Recording tool
- Use **QuickTime Player** → File → New Screen Recording
- Select the simulator window only (not the full display) for a clean crop
- Test the audio level if narrating live

### Resolution check
- Simulator at 100% scale (Physical Size) gives ~390 × 844 pt for iPhone 16 Pro
- Aim for at least 1080p output — QuickTime at Physical Size on a Retina display gives 2x

- [ ] QuickTime is open and ready (or alternative screen recorder configured)
- [ ] Microphone input level is visible and not clipped (if narrating live)
- [ ] Simulator window is the only thing visible in the recording frame
- [ ] A 5-second test recording plays back cleanly

---

## 5. Feature Walkthrough Order

Work through this order every time. It is the same order used in both narration scripts.

| Step | Screen | What to demonstrate |
|---|---|---|
| 1 | Home (dashboard) | **Start here.** Let the loaded state sit for 2–3 seconds. Shows metrics + AI briefing. |
| 2 | Login flow | Tap Sign Out from Profile, then log back in. Shows keyboard chaining (Next moves to password), tap ACCESS SYSTEM. |
| 3 | Goals | Pull to refresh, complete a goal by tapping the status icon, create a new goal via NEW GOAL sheet. |
| 4 | Tasks | Show priority bars, cycle a task through statuses, create a new task with goal link. |
| 5 | Analytics | Show the four metric tiles and completion bars. Pull to refresh. |
| 6 | Agents + AI Planner | Show the five agent cards, type a plan prompt, tap GENERATE PLAN, show the result with steps. |
| 7 | AI Assistant | Send a message, show the structured response and recommended action, tap a follow-up chip. |
| 8 | Profile — Reminders | Show the two seeded reminders, toggle one, create a third from the NEW modal. |
| 9 | Profile — Preferences | Tap a different planning horizon, show the isSaving spinner, return to the same value. |
| 10 | Swagger UI (browser) | Switch to browser, show `/docs`. Expand the `/goals` or `/ai/plan` endpoint. |
| 11 | Home | Return to the app and end on the Home screen. |

---

## 6. What NOT to Show

These items must not appear on screen during recording.

| Do not show | Reason |
|---|---|
| The `backend/.env` file | Contains `JWT_SECRET_KEY` and `DATABASE_URL` — never expose env files |
| The `mobile/.env` or `.env.example` files | No sensitive values, but screen recording of config files looks unprofessional |
| Any red error overlay in the simulator | Indicates a crash — stop recording and debug before continuing |
| The signup form being filled in slowly letter-by-letter | Looks tedious; type quickly or cut to already-filled form |
| The database credentials in Docker logs | If scrolling Docker output, do not pause on the postgres connection string |
| The `AI_PROVIDER=mock` environment variable | Does not need to be stated; describe the provider abstraction verbally instead |
| Any personal email address or real password | Use the `alex@helios.demo` demo account |
| Backend stack traces in the terminal | Minimise the terminal before recording |

---

## 7. Post-Recording

- [ ] Watch the full recording once before exporting
- [ ] Trim the first and last 2 seconds (removes click-to-record UI)
- [ ] Export at original quality (QuickTime → File → Export As → 1080p)
- [ ] Name the file: `helios-demo-v1-[2min|5min]-[date].mov`
- [ ] Back up the recording before editing

To stop the backend after recording:

```bash
cd backend
docker compose down
# Use -v only if you want to wipe the database (fresh start next session)
# docker compose down -v
```

---

## Quick Reference — Startup Commands

```bash
# 1. Start backend
cd backend && docker compose up

# 2. Verify health
curl http://localhost:8000/api/v1/health

# 3. Open Swagger UI
open http://localhost:8000/docs

# 4. Start mobile (new terminal)
cd mobile && npx expo start --ios --clear

# 5. Stop backend when done
cd backend && docker compose down
```
