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
    refresh: "/api/v1/auth/refresh",
    me:      "/api/v1/auth/me",
    account: "/api/v1/auth/account",
  },
  dashboard: {
    summary: "/api/v1/dashboard/summary",
  },
  ai: {
    briefing: "/api/v1/ai/briefing/daily",
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
    list:        "/api/v1/agents",
    orchestrate: "/api/v1/agents/orchestrate",
  },
  goals: {
    list: "/api/v1/goals",
    detail: (id: string) => `/api/v1/goals/${id}`,
    linkedTasks: (id: string) => `/api/v1/goals/${id}/tasks`,
  },
  diagnostics: "/api/v1/health/diagnostics",
  tasks: {
    list: "/api/v1/tasks",
  },
  analytics: {
    summary: "/api/v1/analytics/summary",
  },
  calendar: {
    events: "/api/v1/calendar/events",
  },
  email: {
    messages: "/api/v1/email/messages",
  },
  integrations: {
    base: "/api/v1/integrations",
    mockConnect: "/api/v1/integrations/mock-connect",
    syncStatus: "/api/v1/integrations/sync/status",
    googleConnectUrl: "/api/v1/integrations/google/connect-url",
    googleAuthUrl: "/api/v1/integrations/google/auth-url",
    googleReconnectUrl: "/api/v1/integrations/google/reconnect-url",
    googleExchange: "/api/v1/integrations/google/exchange",
    googleSync: "/api/v1/integrations/google/sync",
    googleDisconnect: "/api/v1/integrations/google/disconnect",
    disconnect: (id: string) => `/api/v1/integrations/${id}`,
    triggerSync: (id: string) => `/api/v1/integrations/${id}/sync`,
  },
  notifications: {
    list: "/api/v1/notifications",
    markRead: (id: string) => `/api/v1/notifications/${id}/read`,
    markAllRead: "/api/v1/notifications/read-all",
    delete: (id: string) => `/api/v1/notifications/${id}`,
  },
  backgroundJobs: {
    base: "/api/v1/background-jobs",
    item: (id: string) => `/api/v1/background-jobs/${id}`,
    trigger: (id: string) => `/api/v1/background-jobs/${id}/trigger`,
  },
  dailyBrief: {
    today:    "/api/v1/daily-brief/today",
    generate: "/api/v1/daily-brief/generate",
    byDate:   (date: string) => `/api/v1/daily-brief/${date}`,
  },
  autonomy: {
    queue: "/api/v1/autonomy/queue",
    item: (id: string) => `/api/v1/autonomy/queue/${id}`,
    execute: (id: string) => `/api/v1/autonomy/queue/${id}/execute`,
    suggestions: "/api/v1/autonomy/suggestions",
    dailyPlan: "/api/v1/autonomy/daily-plan",
    rules: "/api/v1/autonomy/rules",
    rule: (id: string) => `/api/v1/autonomy/rules/${id}`,
    auditLog: "/api/v1/autonomy/audit-log",
  },
  profile: {
    base: "/api/v1/profile",
    userIdCheck: "/api/v1/profile/user-id/check",
    userId: "/api/v1/profile/user-id",
    changePassword: "/api/v1/profile/change-password",
    changeEmail:    "/api/v1/profile/change-email",
  },
  taskEngine: {
    suggestions:         "/api/v1/task-engine/suggestions",
    generate:            "/api/v1/task-engine/suggestions/generate",
    acceptSuggestion:    (id: string) => `/api/v1/task-engine/suggestions/${id}/accept`,
    rejectSuggestion:    (id: string) => `/api/v1/task-engine/suggestions/${id}/reject`,
    completeTask:        (id: string) => `/api/v1/task-engine/tasks/${id}/complete`,
    scheduleTask:        (id: string) => `/api/v1/task-engine/tasks/${id}/schedule`,
  },
  relationships: {
    nextBestAction: "/api/v1/relationships/next-best-action",
    goalProgress:   (goalId: string) => `/api/v1/relationships/goals/${goalId}/progress`,
    availableWindows: "/api/v1/relationships/available-windows",
  },
  history: {
    month:       "/api/v1/history/month",
    range:       "/api/v1/history/range",
    day:         (date: string) => `/api/v1/history/day/${date}`,
    generateDay: (date: string) => `/api/v1/history/day/${date}/generate`,
    lockDay:     (date: string) => `/api/v1/history/day/${date}/lock`,
    notes:       (date: string) => `/api/v1/history/day/${date}/notes`,
  },
  assistantContext: {
    preview: "/api/v1/assistant/context/preview",
  },
} as const;
