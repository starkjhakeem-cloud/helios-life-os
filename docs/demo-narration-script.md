# HELIOS — Demo Narration Scripts

**Phase:** 52

Two complete word-for-word scripts. Read at a natural, conversational pace — no rushing.

- **2-minute version:** ~280 words. For portfolio reels, social posts, interview previews.
- **5-minute technical version:** ~700 words. For recruiter calls, engineering interviews, detailed demos.

Cue notes appear in `[brackets]` — these are actions, not words to speak.

---

## 2-Minute Script

**Target pace:** calm and clear. Pause briefly after each section transition.

---

[Open on the Home screen with data loaded. Let it sit for two seconds.]

"This is HELIOS — a full-stack iOS productivity app built with React Native and FastAPI. Everything you see here is live data pulled from a PostgreSQL backend."

[Tap Goals in the tab bar.]

"In Goals, I can track long-term objectives. Tapping the status icon cycles a goal from Active to Completed."

[Tap the status icon on an Active goal. It becomes Completed with a checkmark.]

"I'll create a new one."

[Tap NEW GOAL. Sheet slides up. Type a title. Tap CREATE.]

"The goal is persisted immediately — no local state, no sync queue."

[Tap Tasks.]

"Tasks have four priority levels, shown here as a colour bar on the left. Tapping the status icon advances a task from to-do, through in progress, to done."

[Cycle one task to done.]

[Tap Analytics.]

"Analytics are computed live in SQL on every request — these numbers are always current."

[Tap Agents.]

"The AI Planner generates structured execution plans from a prompt."

[Type a short prompt and tap GENERATE PLAN. Show the result with steps.]

[Tap the Assistant tab.]

"The assistant supports back-and-forth conversation and can recommend actions like creating a task, which the user confirms with a single tap."

[Show the chat response and one recommended action card.]

[Tap Profile.]

"Preferences sync to the server and persist across sessions."

[Show the planning horizon selector. Change it.]

[Switch to browser showing localhost:8000/docs.]

"The FastAPI backend auto-generates API documentation directly from the Pydantic schemas used for validation."

[Return to the app. Navigate back to Home.]

"That's HELIOS."

---

## 5-Minute Technical Script

**Target pace:** measured and precise. This is for an audience that wants the architecture, not just the visuals.

---

[Open on the Home screen with data loaded.]

"This is HELIOS — a full-stack iOS productivity app. The stack is React Native with Expo SDK 55, TypeScript in strict mode, FastAPI on the backend, PostgreSQL 16 for persistence, and Docker for local deployment. I'm going to walk through the architecture and key implementation decisions in about five minutes."

[Pause one second.]

"The mobile app uses Expo Router for file-based navigation. State is managed by eleven Zustand stores. Two of them — auth and settings — are persisted to AsyncStorage. The other nine are in-memory only and are fully wiped on logout. This means user data never bleeds between sessions."

[Tap Profile, then tap SIGN OUT.]

"Starting with authentication. The login screen uses forwardRef on the Input component — tapping Next on the email field moves focus to the password field automatically. When I tap ACCESS SYSTEM, the app posts to `/auth/login`, receives a JWT HS256 token, stores it in AsyncStorage, and navigates to the dashboard."

[Sign in with the demo credentials.]

"On every cold start, the app calls `/auth/me` to revalidate the token before rendering any protected route. If the token is expired or invalid, it clears the session and routes to login. Signup and login are rate-limited — five requests per minute on signup, ten on login — using the slowapi library. Passwords are hashed with bcrypt at work factor 12."

[Tap Goals.]

"Goals and tasks are the core data model. Every mutation is sent to the backend immediately — there are no local-only writes. The backend uses SQLAlchemy 2.0 with typed Mapped columns and Pydantic v2 for request validation. Enum fields use Pydantic Literal types, so invalid values are rejected at the API boundary before they reach the database."

[Tap the status icon on a goal. Tap NEW GOAL. Type a title and create it.]

"The goal appears in the list because the store appends the API response directly — there is no second fetch."

[Tap Tasks.]

"Tasks have four priority levels and three statuses. The priority bar on the left is a three-pixel wide View with a background colour derived from the priority value — critical is red, medium is amber. Tapping the circle icon cycles the status with haptic feedback. In the create modal, tasks can be linked to an active goal. That foreign key is validated on the backend — the backend checks that the goal belongs to the current user before accepting the link."

[Tap Analytics.]

"Analytics are computed live in SQL on every request — four SELECT aggregates against the goals and tasks tables. No pre-computation, no caching, no stale data. Pull to refresh re-issues the request."

[Pull to refresh. Show the spinner.]

[Tap Agents.]

"The AI system is the most architecturally significant part of the backend. There is an abstract base class, AIProvider, with abstract methods for briefing, plan, chat, and execute_action. A factory function reads the AI_PROVIDER environment variable and returns either the mock provider — which returns deterministic structured responses — or the OpenAI provider, which calls GPT. Swapping providers requires no application code changes."

[Type a prompt in the AI Planner and tap GENERATE PLAN.]

"The plan endpoint also injects live user data — current goals and tasks are embedded in the prompt when the include_context flag is set. The response includes a title, summary, numbered steps with day targets, risks, and a recommendation."

[Tap the Assistant tab.]

"Conversation history is persisted to PostgreSQL. The conversation is fetched on app start and messages are appended locally after each exchange. The AI response includes suggested follow-up questions, which appear as chips below the response, and recommended actions."

[Tap a follow-up chip. Show the recommended action card.]

"The execute_action endpoint accepts an action type — create_task, create_goal, or update_task_status — and executes it. The created resource is returned and surfaced to the user."

[Tap Profile.]

"Reminders use Expo Notifications for local scheduling. There is no server-side push infrastructure — notifications fire from the device. Permission is requested at first use with graceful denial handling."

[Scroll to Preferences. Tap a different planning horizon.]

"User preferences are persisted in a separate PostgreSQL table. Updates use an optimistic pattern: the UI updates immediately, the PATCH runs in the background, and the store rolls back on failure. The isSaving indicator you see briefly is driven by the store's isSaving flag."

[Switch to the browser at localhost:8000/docs.]

"FastAPI generates interactive API documentation directly from the Pydantic models — the same schemas used for validation, serialisation, and the OpenAPI spec. You can see all eleven route groups: auth, goals, tasks, analytics, dashboard, agents, AI, conversations, reminders, settings, and health."

[Expand one endpoint — for example `/api/v1/ai/plan` or `/api/v1/goals`.]

"The request and response schemas are derived automatically. No manual documentation to maintain."

[Return to the app and navigate to Home.]

"The backend runs in Docker. The production Dockerfile executes `alembic upgrade head` before starting Uvicorn — migrations are applied automatically on every deploy. There are six migrations across seven tables, with proper CASCADE and SET NULL foreign key rules."

[Let the Home screen sit for one second.]

"That's HELIOS — authentication, persistence, live analytics, and an AI layer with a swappable provider. The full codebase is available for review."

---

## Delivery Notes

- **Pace:** 100–110 words per minute is natural for technical content. Slower is better.
- **Pauses:** After completing an action on screen, pause one full second before speaking again so the viewer can see the result.
- **Transitions:** When switching tabs, let the animation complete before beginning the next sentence.
- **Errors:** If an unexpected loading state appears, stay quiet and wait. Do not narrate errors.
- **Retakes:** Record each section as a separate take if reading live — edit in post rather than restarting the full recording.
