import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskSuggestion = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  estimated_duration_minutes: number | null;
  category: string | null;
  source_type: string;
  source_id: string | null;
  source_metadata: Record<string, unknown> | null;
  linked_goal_id: string | null;
  confidence: number;
  reason: string | null;
  accepted_task_id: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
};

export type HeliosRecommendation = {
  id: string;
  type: "goal" | "task" | "calendar" | "email" | "planning" | "recovery" | "assistant" | "none";
  title: string;
  description: string;
  score: number;
  reason: string;
  urgency: "low" | "medium" | "high" | "critical";
  impact: "low" | "medium" | "high";
  effortMinutes: number | null;
  sourceIds: {
    goalId?: string | null;
    taskId?: string | null;
    eventId?: string | null;
    emailId?: string | null;
  };
  action: {
    label: string;
    route?: string | null;
    operation?: string | null;
  };
  confidence?: number | null;
  priority?: string | null;
  due_date?: string | null;
  estimated_duration_minutes?: number | null;
  linked_goal_id?: string | null;
  linked_task_id?: string | null;
  suggested_start_time?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SuggestedTasksResponse = {
  suggestions: TaskSuggestion[];
  next_best_action: Record<string, unknown>;
  recommendations: HeliosRecommendation[];
  generated: number;
};

export type AcceptSuggestionRequest = {
  schedule?: boolean;
  schedule_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type AcceptSuggestionResponse = {
  suggestion: TaskSuggestion;
  task: Record<string, unknown>;
  calendar_event: Record<string, unknown> | null;
  goal_progress: Record<string, unknown> | null;
};

export type CompleteTaskResponse = {
  task: Record<string, unknown>;
  daily_history_updated: boolean;
  goal_progress: Record<string, unknown> | null;
};

export type ScheduleTaskRequest = {
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type ScheduleTaskResponse = {
  task: Record<string, unknown>;
  calendar_event: Record<string, unknown>;
  selected_window: Record<string, unknown> | null;
};

export type BuildDayRequest = {
  date?: string | null;
  commit?: boolean;
  max_items?: number;
};

export type BuildDayScheduleBlock = {
  id: string;
  title: string;
  startTime?: string | null;
  endTime?: string | null;
  type: "calendar" | "task" | "goal" | "email" | "break" | "focus" | "planning";
  sourceId?: string | null;
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
};

export type BuildDayTopTask = {
  id?: string | null;
  title: string;
  reason: string;
  estimatedMinutes?: number | null;
};

export type BuildDayResponse = {
  date: string;
  generated_at: string;
  committed: boolean;
  summary: string;
  primaryFocus: string;
  scheduleBlocks: BuildDayScheduleBlock[];
  topTasks: BuildDayTopTask[];
  warnings: string[];
  awareness: Record<string, unknown>;
  scheduled_items: Record<string, unknown>[];
  unscheduled_actions: Record<string, unknown>[];
  windows_remaining: Record<string, unknown>[];
  next_best_action: Record<string, unknown>;
  recommendations: HeliosRecommendation[];
  filtered_email_count: number;
};

// ── Service ───────────────────────────────────────────────────────────────────

class TaskEngineService {
  getSuggestions(token: string): Promise<SuggestedTasksResponse> {
    return apiClient.get<SuggestedTasksResponse>(
      API_ENDPOINTS.taskEngine.suggestions,
      token,
    );
  }

  generateSuggestions(
    token: string,
    limit = 5,
    sources?: string[],
  ): Promise<SuggestedTasksResponse> {
    return apiClient.post<SuggestedTasksResponse>(
      API_ENDPOINTS.taskEngine.generate,
      { limit, sources: sources ?? null },
      token,
    );
  }

  acceptSuggestion(
    token: string,
    id: string,
    req: AcceptSuggestionRequest = {},
  ): Promise<AcceptSuggestionResponse> {
    return apiClient.post<AcceptSuggestionResponse>(
      API_ENDPOINTS.taskEngine.acceptSuggestion(id),
      req,
      token,
    );
  }

  rejectSuggestion(
    token: string,
    id: string,
    reason?: string,
  ): Promise<TaskSuggestion> {
    return apiClient.post<TaskSuggestion>(
      API_ENDPOINTS.taskEngine.rejectSuggestion(id),
      { reason: reason ?? null },
      token,
    );
  }

  completeTask(token: string, taskId: string): Promise<CompleteTaskResponse> {
    return apiClient.post<CompleteTaskResponse>(
      API_ENDPOINTS.taskEngine.completeTask(taskId),
      {},
      token,
    );
  }

  scheduleTask(
    token: string,
    taskId: string,
    req: ScheduleTaskRequest = {},
  ): Promise<ScheduleTaskResponse> {
    return apiClient.post<ScheduleTaskResponse>(
      API_ENDPOINTS.taskEngine.scheduleTask(taskId),
      req,
      token,
    );
  }

  buildDay(
    token: string,
    req: BuildDayRequest = {},
  ): Promise<BuildDayResponse> {
    return apiClient.post<BuildDayResponse>(
      API_ENDPOINTS.taskEngine.buildDay,
      req,
      token,
    );
  }
}

export const taskEngineService = new TaskEngineService();
