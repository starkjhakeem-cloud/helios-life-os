import { API_ENDPOINTS } from "../config/api";
import { apiClient } from "./apiClient";

export type AwarenessDayPeriod = "morning" | "afternoon" | "evening" | "night";

export type RealTimeContext = {
  now: string;
  localTime: string;
  localDate: string;
  timezone: string;
  dayOfWeek: string;
  month: string;
  year: number;
  dayPeriod: AwarenessDayPeriod;
  isWeekend: boolean;
  sunrise?: string | null;
  sunset?: string | null;
  weather?: {
    condition: string;
    temperature?: number | null;
    precipitationChance?: number | null;
    source: string;
    locationLabel?: string | null;
    providerReady?: boolean;
  } | null;
  location?: {
    city?: string | null;
    state?: string | null;
    country?: string | null;
    label?: string | null;
    source: string;
  } | null;
  calendar: {
    currentEvent?: Record<string, unknown> | null;
    nextEvent?: Record<string, unknown> | null;
    busy: boolean;
    availableMinutes: number;
    freeWindows: Record<string, unknown>[];
    eventCountToday: number;
  };
  goals: {
    activeCount: number;
    urgentCount: number;
    goalsWithoutTasks: number;
    stalledCount: number;
    highestPriorityGoal?: Record<string, unknown> | null;
  };
  tasks: {
    dueToday: number;
    overdue: number;
    remaining: number;
    completedToday: number;
    estimatedWorkMinutes: number;
    currentTask?: Record<string, unknown> | null;
    highestPriorityTask?: Record<string, unknown> | null;
  };
  integrations: {
    gmail: boolean;
    googleCalendar: boolean;
    connectedCount: number;
    needsAttentionCount: number;
  };
  connectedServices: Record<string, unknown>[];
  battery?: {
    level?: number | null;
    charging?: boolean | null;
    source: string;
  } | null;
  network: {
    online: boolean;
    status: string;
    source: string;
  };
  profile: Record<string, unknown>;
  generatedAt: string;
  cacheTtlSeconds: number;
  source: string;
};

class AwarenessService {
  current(
    token: string,
    options: { date?: string; refresh?: boolean } = {},
  ): Promise<RealTimeContext> {
    const params = new URLSearchParams();
    if (options.date) params.set("date", options.date);
    if (options.refresh) params.set("refresh", "true");
    const query = params.toString();
    const endpoint = query
      ? `${API_ENDPOINTS.awareness.current}?${query}`
      : API_ENDPOINTS.awareness.current;
    return apiClient.get<RealTimeContext>(endpoint, token);
  }
}

export const awarenessService = new AwarenessService();
