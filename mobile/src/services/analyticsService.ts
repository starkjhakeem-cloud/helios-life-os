import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type AnalyticsSummary = {
  total_goals: number;
  completed_goals: number;
  active_goals: number;
  paused_goals: number;
  goal_completion_rate: number;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
  overdue_tasks: number;
  high_priority_tasks: number;
  task_completion_rate: number;
  generated_at: string;
};

export const analyticsService = {
  getSummary: (token: string) =>
    apiClient.get<AnalyticsSummary>(API_ENDPOINTS.analytics.summary, token),
};
