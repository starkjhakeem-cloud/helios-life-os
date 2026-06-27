# HELIOS Mobile

React Native / Expo iOS application for the HELIOS AI Life Operating System.

Built with Expo SDK 55, Expo Router v4 file-based navigation, TypeScript strict mode, and Zustand v5 for state management.

---

## Quick Start

```bash
npm install
npx expo start
```

Press `i` to open in iOS Simulator. The app expects the HELIOS backend running on `localhost:8000` — see the [backend README](../backend/README.md) for setup instructions.

> Running on a physical device? Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your machine's LAN address, for example `http://192.168.1.110:8000`. Do not edit source code for device switching.

## API URL Resolution

HELIOS resolves the backend URL in this order:

1. `EXPO_PUBLIC_API_URL`, when present, is always used in development and production.
2. iOS Simulator falls back to `http://localhost:8000`.
3. Android Emulator falls back to `http://10.0.2.2:8000`.
4. Physical devices and production builds without `EXPO_PUBLIC_API_URL` show a clear configuration error.

Local physical-device setup:

```bash
cp .env.example .env
ipconfig getifaddr en0
```

Set the result in `mobile/.env`:

```ini
EXPO_PUBLIC_API_URL=http://<your-mac-lan-ip>:8000
```

Restart Expo after changing `.env`:

```bash
npx expo start --clear
```

---

## Project Layout

```
src/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # Root layout — hydration guard, auth routing
│   ├── (auth)/
│   │   ├── _layout.tsx           # Auth stack shell
│   │   ├── login.tsx             # Login screen
│   │   └── signup.tsx            # Signup screen
│   └── (tabs)/
│       ├── _layout.tsx           # Tab bar — secondary auth guard
│       ├── index.tsx             # Home / Dashboard
│       ├── analytics.tsx         # Analytics screen
│       ├── agents.tsx            # Agents + AI Planner screen
│       ├── goals.tsx             # Goals screen
│       └── tasks.tsx             # Tasks screen
│
├── components/
│   ├── ui/                       # Primitives: Button, Input, Screen, Text
│   ├── AgentCard.tsx
│   ├── BriefingCard.tsx
│   ├── GoalCard.tsx
│   ├── MetricCard.tsx
│   ├── PlanCard.tsx
│   ├── SectionCard.tsx
│   └── TaskCard.tsx
│
├── config/
│   └── api.ts                    # API_CONFIG (BASE_URL, TIMEOUT_MS) + API_ENDPOINTS
│
├── hooks/
│   └── useBackendHealth.ts       # Polls /health on app start
│
├── services/                     # API client + one service module per resource
│   ├── apiClient.ts              # fetch wrapper with timeout, error parsing, JWT header
│   ├── authService.ts
│   ├── goalsService.ts
│   ├── tasksService.ts
│   ├── analyticsService.ts
│   ├── agentsService.ts
│   ├── aiService.ts
│   └── dashboardService.ts
│
├── store/                        # Zustand state
│   ├── useAuthStore.ts           # Persisted (AsyncStorage) — auth credentials + revalidate
│   ├── useGoalsStore.ts
│   ├── useTasksStore.ts
│   ├── useAnalyticsStore.ts
│   ├── useAgentsStore.ts
│   ├── useAIStore.ts
│   ├── useDashboardStore.ts
│   └── index.ts                  # Barrel exports
│
└── theme/
    └── theme.ts                  # colors, spacing, radius, typography tokens
```

---

## State Management

All state lives in Zustand stores. The auth store is persisted to AsyncStorage via `zustand/middleware/persist`; all other stores are in-memory only.

```
useAuthStore    — user, accessToken, login, signup, logout, revalidate
useGoalsStore   — goals[], fetchGoals, createGoal, updateGoal, deleteGoal, reset
useTasksStore   — tasks[], fetchTasks, createTask, updateTask, deleteTask, reset
useAnalyticsStore — summary, fetchSummary, reset
useAgentsStore  — agents[], fetchAgents, reset
useAIStore      — briefing, plan, fetchBriefing, generatePlan, clearPlan, reset
useDashboardStore — metrics, sections, fetchSummary, reset
```

`logout()` in `useAuthStore` calls `reset()` on all six data stores before clearing credentials, ensuring no stale user data persists in memory between sessions.

---

## Auth Flow

On every app start:

1. Root `_layout.tsx` mounts and waits for Zustand persist to finish reading AsyncStorage
2. Once hydrated, `revalidate()` calls `GET /auth/me` with the persisted token
3. If the token is valid: user data is refreshed, routing proceeds to `(tabs)`
4. If the token is expired or absent: session is cleared, routing redirects to `(auth)/login`
5. The hydration guard (`[hydrated, setHydrated]`) prevents any route render until step 2–4 complete, eliminating the flash-to-login on cold start

---

## API Client

`services/apiClient.ts` provides `get`, `post`, `patch`, and `del` methods. Each:
- Attaches `Authorization: Bearer <token>` when a token is provided
- Uses `AbortController` with a 15-second timeout (`API_CONFIG.TIMEOUT_MS`)
- Parses FastAPI error responses (both string `detail` and array `detail` formats)
- Converts backend reachability failures into a frontend-safe message that includes the current API URL

---

## Design System

All visual tokens are defined in `theme/theme.ts`:

| Token group | Examples |
|---|---|
| Colors | `background: #050816`, `surface: #10172a`, `accentCyan: #22d3ee`, `accent: #7c3aed` |
| Spacing | `xs: 4`, `sm: 8`, `md: 16`, `lg: 24`, `xl: 32` |
| Border radius | `sm: 12`, `md: 18`, `lg: 24` |
| Typography | `displayLarge` (40/900), `displaySmall` (28/800), `title` (20/700), `body` (15/400) |

The UI uses a dark space-themed palette throughout. SF Symbols (`expo-symbols`) are used for all icons.

---

## TypeScript

The project uses `strict: true`. Run the type-checker:

```bash
npx tsc --noEmit
```

All Zustand stores are fully typed. The `apiClient` is generic (`get<T>`, `post<T>`, etc.) and returns typed responses. No `any` casts in production code paths.

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `expo` ~55 | Managed workflow runtime |
| `expo-router` ~55 | File-based navigation |
| `expo-symbols` ~55 | SF Symbols icon rendering |
| `expo-splash-screen` | Controlled splash screen dismissal |
| `zustand` ^5 | State management |
| `@react-native-async-storage/async-storage` | Token persistence |
| `react-native-safe-area-context` | Safe area insets |
| `react-native-reanimated` | Animation primitives |
