export const API_CONFIG = {
  BASE_URL: __DEV__ ? "http://localhost:8000" : "https://api.helios.app",
  TIMEOUT_MS: 5000,
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
