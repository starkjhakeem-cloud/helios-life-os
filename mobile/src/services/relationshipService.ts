import { API_ENDPOINTS } from "../config/api";
import { apiClient } from "./apiClient";

export type NextBestAction = {
  type: "task" | "focus_block" | "goal" | "calendar" | "none";
  title: string;
  reason: string;
  estimated_duration_minutes: number | null;
  linked_goal_id: string | null;
  linked_task_id: string | null;
  suggested_start_time: string | null;
  confidence: number;
};

export type TimeWindow = {
  start_time: string;
  end_time: string;
  duration_minutes: number;
  suggested_use: string;
  confidence: number;
};

export const relationshipService = {
  nextBestAction: (token: string) =>
    apiClient.get<NextBestAction>(API_ENDPOINTS.relationships.nextBestAction, token),

  availableWindows: (token: string, date?: string) => {
    const suffix = date ? `?date=${encodeURIComponent(date)}` : "";
    return apiClient.get<TimeWindow[]>(
      `${API_ENDPOINTS.relationships.availableWindows}${suffix}`,
      token,
    );
  },
};
