# HELIOS — Post-V1 Backlog

Created after the Phase 40 V1 readiness audit. Every item is based on actual code inspection — no guesswork.

**Priority scale:**
- **Must-have** — blocking a polished demo or production release
- **Should-have** — materially improves the product; worth doing before going public
- **Could-have** — good to have; lower return on investment at current scale

**Difficulty scale:** Low (< half a day) · Medium (1–2 days) · High (3+ days)

---

## 1 — Critical Fixes

These are things that look wrong to any technical observer right now.

| Item | Detail | Priority | Difficulty |
|---|---|---|---|
| ~~**Dashboard metrics are hardcoded**~~ | ✅ **Fixed in Phase 42.** Dashboard now computes Active Goals, Tasks Done, Completion Rate, and Open Tasks from the user's live PostgreSQL data. Section text adapts to the user's data state. | Must-have | Medium |
| ~~**`openai` dependency is unpinned**~~ | ✅ **Fixed in Phase 42.** Pinned to `openai==2.38.0` — the version verified in the running container. | Should-have | Low |
| **Splash image is wrong size** | `splash-icon.png` is 228×213 px (non-square, tiny). On iOS, Expo's splash screen will scale it up, producing a blurry result. Replace with a square PNG ≥ 1024×1024. | Must-have (for TestFlight) | Low |

---

## 2 — Security Hardening

| Item | Detail | Priority | Difficulty |
|---|---|---|---|
| ~~**No rate limiting on auth endpoints**~~ | ✅ **Fixed in Phase 42.** Added `slowapi==0.1.9`. `/login` is limited to 10/minute per IP; `/signup` to 5/minute per IP. Exceeding the limit returns HTTP 429. | Must-have (for public release) | Medium |
| **JWT stored in AsyncStorage (unencrypted)** | AsyncStorage is not encrypted on-device. iOS Keychain (`expo-secure-store`) is the correct place for sensitive tokens. Migration requires replacing the Zustand persist storage adapter. | Should-have | Medium |
| **No refresh tokens** | Access tokens expire in 60 minutes. Users must re-login frequently. Implement a `POST /auth/refresh` endpoint with a longer-lived refresh token stored in AsyncStorage (or Keychain after the above fix). | Should-have | High |
| **`backend/.env` in early git history** | The `.env` file appears in 5 early commits. The committed values were placeholders (`your-secret-here`), so no real secret was exposed. Before making the repository public, run: `git filter-repo --path backend/.env --invert-paths` | Must-have (before public repo) | Low |
| ~~**No account deletion**~~ | ✅ **Fixed in Phase 42.** `DELETE /api/v1/auth/account` endpoint permanently deletes the user and all associated data via CASCADE. Mobile: "DELETE ACCOUNT" button in Profile with confirmation alert; `deleteAccount()` action in `useAuthStore` clears all stores on success. | Must-have (for App Store) | Medium |
| **No email verification** | Any string passing basic format validation is accepted at signup. Adding OTP or link-based verification prevents spam accounts and is expected by App Store reviewers. | Should-have | High |

---

## 3 — UX Polish

| Item | Detail | Priority | Difficulty |
|---|---|---|---|
| **Date inputs use plain text** | Goal target date, task due date, and reminder time are plain text fields requiring ISO 8601 format. Replace with native date/time pickers (`@react-native-community/datetimepicker` or Expo's date picker) for standard iOS UX. | Should-have | Medium |
| ~~**"AI Alerts — Coming in a future update" visible**~~ | ✅ **Fixed in Phase 42.** The disabled AI notifications row with "Coming in a future update" text was removed from the Preferences section. The `ai_notifications` preference is still stored in the backend for future use. | Must-have (for demo) | Low |
| **No empty state on Dashboard** | If a new user has no goals or tasks, the Home screen shows hardcoded metrics and a generic AI briefing that doesn't acknowledge the empty state. Add a first-run onboarding card or contextual "Get started" prompt. | Should-have | Medium |
| **Error messages are generic on network failure** | When the backend is unreachable, users see "Network error. Check your connection." on all screens simultaneously. A single top-level error banner would be cleaner than per-screen errors. | Could-have | Medium |
| **No search or filter on Goals/Tasks** | With >20 goals or tasks, users have no way to filter by status or search by title. | Could-have | Medium |
| **Loading skeletons** | Screens show `ActivityIndicator` spinners on first load. Platform-standard skeleton placeholders (shimmer effect) feel more polished. | Could-have | Medium |
| **App icon transparent background** | The current `icon.png` has a transparent background. Apple App Store requires all app icons to be fully opaque. Verify with `expo doctor` and add a solid background to the icon. | Must-have (for App Store) | Low |

---

## 4 — AI Improvements

| Item | Detail | Priority | Difficulty |
|---|---|---|---|
| **Activate OpenAI provider** | The implementation is complete. Set `AI_PROVIDER=openai` + `OPENAI_API_KEY` in `.env` to enable real GPT responses. The only "work" is obtaining and configuring an OpenAI key. | Must-have (for live demo) | Low |
| **AI context injection not visible in UI** | The chat endpoint supports `include_context: true` which injects the user's live goals and tasks into the AI prompt — but the UI always sends `false`. Add a toggle or make it always-on to show context-aware responses. | Should-have | Low |
| **No streaming responses** | AI responses load all at once, with a spinner, then appear. Streaming (`ReadableStream` / SSE) would provide character-by-character output like ChatGPT, improving perceived performance significantly. | Could-have | High |
| **Conversation titles are first-message text** | New conversations are auto-titled from the first user message (truncated to 100 chars). A smarter option: ask the AI to generate a short title after the first exchange. | Could-have | Low |
| **No conversation deletion in UI** | The conversation list is displayed in the AI Assistant tab, but there is no delete button. Users cannot clear old conversations. | Should-have | Low |

---

## 5 — Backend Scalability

| Item | Detail | Priority | Difficulty |
|---|---|---|---|
| ~~**Dashboard not connected to real data**~~ | ✅ **Fixed in Phase 42.** See Critical Fixes #1 above. | Must-have | Medium |
| **Connection pool is tight** | `pool_size=5, max_overflow=0` means only 5 simultaneous DB connections before requests queue. Under load (e.g., concurrent AI calls) this becomes a bottleneck. Increase `max_overflow` to 10 for production. | Should-have | Low |
| **Analytics computed on every request** | `/analytics/summary` runs a full table scan on goals and tasks on each call. At low scale this is fine. At >1000 rows per user, consider caching with a short TTL (e.g., 60 seconds via Redis or in-memory). | Could-have | High |
| **No compound database indexes** | `ix_goals_user_id` and `ix_tasks_user_id` exist, but queries that filter by both `user_id` and `status` would benefit from compound indexes. | Could-have | Low |
| **`uvicorn --reload` in production warning** | The `docker-compose.yml` command uses `--reload`, which is correct for local dev. The Dockerfile CMD correctly omits it. This is already documented; just flagging it here for tracking. | No action needed | — |

---

## 6 — Mobile Release Readiness

| Item | Detail | Priority | Difficulty |
|---|---|---|---|
| **Replace bundle identifier placeholder** | `ios.bundleIdentifier: "com.helios.app"` must be changed to a real Apple-registered App ID before any EAS build. | Must-have | Low |
| **Run `eas build:configure`** | EAS `projectId` is not yet set in `app.json`. Running `eas build:configure` once links the project to an Expo account and writes the ID. | Must-have | Low |
| **Remote push notifications** | Current notifications are local only (scheduled on-device via `expo-notifications`). Remote push (APNs) would allow server-triggered notifications for overdue tasks, daily briefings, etc. Requires a push token service and APNs certificate. | Could-have | High |
| **Privacy Policy URL** | Required by Apple for any app with user accounts. Write a minimal privacy policy and host it (e.g., GitHub Pages, Notion). | Must-have (for App Store) | Low |
| **App Store screenshots** | Required for App Store listing. Capture 6.9" iPhone + 6.5" iPhone screenshots. Not required for TestFlight. | Must-have (for App Store) | Low |
| **Deep link routes** | `scheme: "helios"` is configured but no in-app routes handle deep links. Define at least `helios://goals` and `helios://tasks` for future shareability. | Could-have | Low |
| **iPad layout** | `supportsTablet: false` is set correctly. No action needed unless iPad support is desired. | Could-have | High |

---

## 7 — Portfolio / Demo Improvements

| Item | Detail | Priority | Difficulty |
|---|---|---|---|
| **Screenshot the app** | The README Screenshots section says "coming soon". Follow `docs/demo-plan.md` to capture all 19 screens and add them to the README. | Must-have (for portfolio) | Low |
| **Live demo environment** | Deploying the backend to Render/Railway and pointing a preview EAS build at it would let recruiters/observers interact with the real app without running Docker locally. | Should-have | Medium |
| **README badges** | Add build status, version, and technology badges at the top of README (e.g., via shields.io): `React Native 0.83`, `Expo SDK 55`, `FastAPI`, `PostgreSQL 16`. | Could-have | Low |
| **Demo video** | Follow `docs/demo-plan.md`'s walkthrough script. A 3–5 minute Loom or QuickTime recording showing all features end-to-end is more compelling than screenshots. | Should-have | Low |
| **Portfolio website mention** | If you have a personal portfolio site, HELIOS deserves a featured project entry with architecture highlights and a GitHub link. | Could-have | Low |

---

## Recommended Next 5 Phases

These are sequenced for maximum impact relative to effort.

### ✅ Phase 42 — High-Priority Post-V1 Fixes (completed)
**Fixed:** Live dashboard metrics, rate limiting on auth, account deletion, AI Alerts UI removal, `openai` version pinning.

See git log for the full diff.

---

### Phase 43 — Auth Rate Limiting and AI Context Toggle
**What:** Add per-IP rate limiting to `/signup` and `/login` using `slowapi`. As a bonus: flip the chat endpoint to send `include_context: true` so AI responses are context-aware by default (or add a visible toggle in the UI).

**Why second:** Rate limiting is a standard security control that a professional backend should have. Context-aware AI is a significant feature improvement that's nearly free — the backend already supports it.

**Scope:** `backend/requirements.txt` (add slowapi), `backend/app/main.py` (add limiter), `backend/app/routers/auth.py` (decorate endpoints), `mobile/src/app/(tabs)/assistant.tsx` (pass `include_context: true`).

**Difficulty:** Low–Medium

---

### Phase 44 — OpenAI Activation and End-to-End AI Test
**What:** Set `AI_PROVIDER=openai` in `.env`, add a real `OPENAI_API_KEY`, run the full briefing/plan/chat flow with real GPT responses, and update the demo docs with the live AI output.

**Why third:** The implementation is complete. This is a configuration exercise, not a development task. Once done, every demo involving AI becomes dramatically more impressive.

**Scope:** `.env` only; possibly update README "AI Architecture" section with the activation steps confirmed against a real key.

**Difficulty:** Low (requires paid OpenAI key)

---

### Phase 45 — TestFlight Distribution
**What:** Set the real bundle identifier, run `eas build:configure`, provision Apple credentials via `eas credentials`, and run `npm run build:ios:preview`. Submit to TestFlight for internal distribution.

**Why fourth:** Having a TestFlight build that recruiters can install on their iPhone is a category-differentiating portfolio asset. Most portfolio apps never get off the Simulator.

**Scope:** `mobile/app.json` (real bundle ID), run EAS CLI commands, Apple Developer account. No code changes required if the backend is deployed.

**Difficulty:** Low–Medium (requires Apple Developer account + deployed backend)

---

### Phase 46 — Splash Image, Icon Audit, and App Store Screenshots
**What:** Replace `splash-icon.png` with a proper square ≥ 1024×1024 image. Run `expo doctor` to check the app icon for transparency issues. Capture all 19 screenshots from `docs/demo-plan.md`.

**Why fifth:** These are the three remaining visual gaps. A polished splash screen and real screenshots close the gap between "promising project" and "production-ready app."

**Scope:** Asset replacement in `mobile/assets/images/`, screenshot capture workflow, README update.

**Difficulty:** Low

---

## Summary Table

| Phase | Theme | Must-haves addressed | Difficulty |
|---|---|---|---|
| ~~42~~ | ~~Live dashboard metrics~~ | ✅ Done — dashboard live, rate limiting, account deletion, AI Alerts removed | — |
| 43 | AI context always-on | AI context injection in chat | Low |
| 44 | OpenAI activation | Real AI responses | Low |
| 45 | TestFlight distribution | Bundle ID, EAS build, real device | Low–Medium |
| 46 | Assets + screenshots | Splash image, icon audit, screenshots | Low |

After these 5 phases: HELIOS is deployable to TestFlight, shows real AI responses, has a live dashboard, and has screenshots in the README. That's a complete, demo-ready V1.5.
