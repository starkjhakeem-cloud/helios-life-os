// Production API URL — set EXPO_PUBLIC_API_URL in your build environment or .env
// to override the default. Falls back to localhost in development.
const _prodUrl = process.env.EXPO_PUBLIC_API_URL ?? "https://api.helios.app";

export const API_CONFIG = {
  BASE_URL: __DEV__ ? "http://localhost:8000" : _prodUrl,
  // Raised to 15s — AI endpoints (briefing, plan, chat) can take several seconds
  TIMEOUT_MS: 15000,
} as const;

export const API_ENDPOINTS = {
  health:  "/api/v1/health",
  version: "/api/v1/version",
  auth: {
    login:   "/api/v1/auth/login",
    signup:  "/api/v1/auth/signup",
    me:      "/api/v1/auth/me",
    account: "/api/v1/auth/account",
  },
  dashboard: {
    summary: "/api/v1/dashboard/summary",
  },
  ai: {
    briefing: "/api/v1/ai/briefing",
    plan:     "/api/v1/ai/plan",
    chat:     "/api/v1/ai/chat",
    execute:  "/api/v1/ai/actions/execute",
    memory:   "/api/v1/ai/memory",
  },
  conversations: {
    base: "/api/v1/ai/conversations",
  },
  reminders: {
    base: "/api/v1/reminders",
  },
  settings: {
    preferences: "/api/v1/settings/preferences",
  },
  agents: {
    list: "/api/v1/agents",
  },
  goals: {
    list: "/api/v1/goals",
  },
  diagnostics: "/api/v1/health/diagnostics",
  tasks: {
    list: "/api/v1/tasks",
  },
  analytics: {
    summary: "/api/v1/analytics/summary",
  },
} as const;
