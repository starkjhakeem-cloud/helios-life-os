export const API_CONFIG = {
  BASE_URL: __DEV__ ? "http://localhost:8000" : "https://api.helios.app",
  // Raised to 15s — AI endpoints (briefing, plan, chat) can take several seconds
  TIMEOUT_MS: 15000,
} as const;

export const API_ENDPOINTS = {
  health:  "/api/v1/health",
  version: "/api/v1/version",
  auth: {
    login:  "/api/v1/auth/login",
    signup: "/api/v1/auth/signup",
    me:     "/api/v1/auth/me",
  },
  dashboard: {
    summary: "/api/v1/dashboard/summary",
  },
  ai: {
    briefing: "/api/v1/ai/briefing",
    plan:     "/api/v1/ai/plan",
    chat:     "/api/v1/ai/chat",
    execute:  "/api/v1/ai/actions/execute",
  },
  agents: {
    list: "/api/v1/agents",
  },
  goals: {
    list: "/api/v1/goals",
  },
  tasks: {
    list: "/api/v1/tasks",
  },
  analytics: {
    summary: "/api/v1/analytics/summary",
  },
} as const;
