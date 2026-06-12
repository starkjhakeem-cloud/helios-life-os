import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";
import type { PlanResponse } from "./aiService";

export type RiskLevel = "low" | "medium" | "high";
export type QueueStatus = "pending" | "approved" | "rejected" | "completed";

export type AutonomyQueueItem = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  source_agent: string;
  proposed_action_type: string;
  payload_preview: Record<string, unknown>;
  risk_level: RiskLevel;
  status: QueueStatus;
  created_at: string;
  updated_at: string;
};

export type AutonomyQueueListResponse = {
  items: AutonomyQueueItem[];
  total: number;
};

export type AutonomyQueueItemCreate = {
  title: string;
  description?: string | null;
  source_agent: string;
  proposed_action_type: string;
  payload_preview: Record<string, unknown>;
  risk_level?: RiskLevel;
};

export type AutonomyQueueStatusUpdate = {
  status: "approved" | "rejected" | "completed";
};

export type AutonomyExecuteResult = {
  success: boolean;
  action_type: string;
  message: string;
  queue_item_id: string;
  created_or_updated_id?: string | null;
  executed_at: string;
  plan?: PlanResponse | null;
};

export type SuggestionItem = {
  id: string;
  title: string;
  description: string;
  source_agent: string;
  suggested_action_type: string;
  risk_level: RiskLevel;
  reason: string;
  payload_preview: Record<string, unknown>;
  created_at: string;
};

export type SuggestionsResponse = {
  suggestions: SuggestionItem[];
  total: number;
  generated_at: string;
};

export type FocusBlock = {
  time_range: string;
  activity: string;
  task_title: string | null;
  energy_level: "high" | "medium" | "low";
};

export type PriorityTask = {
  rank: number;
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  estimated_duration: string;
  linked_goal: string | null;
  reason: string;
};

export type DailyPlan = {
  plan_date: string;
  overview: string;
  focus_blocks: FocusBlock[];
  priority_tasks: PriorityTask[];
  schedule_conflicts: string[];
  recommended_agent_actions: string[];
  risks: string[];
  suggested_queue_items: SuggestionItem[];
  generated_at: string;
};

export type AutonomyRule = {
  id: string;
  user_id: string;
  action_type: string;
  risk_level: RiskLevel | null;
  requires_manual_approval: boolean;
  allow_execution: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AutonomyRuleCreate = {
  action_type: string;
  risk_level?: RiskLevel | null;
  requires_manual_approval?: boolean;
  allow_execution?: boolean;
  notes?: string | null;
};

export type AutonomyRuleUpdate = {
  requires_manual_approval?: boolean;
  allow_execution?: boolean;
  notes?: string | null;
};

export type AutonomyRulesResponse = {
  rules: AutonomyRule[];
  total: number;
};

export type AutonomyAuditLogEntry = {
  id: string;
  user_id: string;
  event_type: string;
  source: string;
  related_queue_item_id: string | null;
  action_type: string | null;
  risk_level: RiskLevel | null;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AutonomyAuditLogResponse = {
  entries: AutonomyAuditLogEntry[];
  total: number;
};

export const autonomyService = {
  list: (token: string, status?: QueueStatus) => {
    const url = status
      ? `${API_ENDPOINTS.autonomy.queue}?status=${status}`
      : API_ENDPOINTS.autonomy.queue;
    return apiClient.get<AutonomyQueueListResponse>(url, token);
  },

  create: (token: string, body: AutonomyQueueItemCreate) =>
    apiClient.post<AutonomyQueueItem>(API_ENDPOINTS.autonomy.queue, body, token),

  updateStatus: (token: string, id: string, body: AutonomyQueueStatusUpdate) =>
    apiClient.patch<AutonomyQueueItem>(API_ENDPOINTS.autonomy.item(id), body, token),

  execute: (token: string, id: string) =>
    apiClient.post<AutonomyExecuteResult>(API_ENDPOINTS.autonomy.execute(id), {}, token),

  delete: (token: string, id: string) =>
    apiClient.del(API_ENDPOINTS.autonomy.item(id), token),

  getSuggestions: (token: string, limit?: number) => {
    const url = limit
      ? `${API_ENDPOINTS.autonomy.suggestions}?limit=${limit}`
      : API_ENDPOINTS.autonomy.suggestions;
    return apiClient.get<SuggestionsResponse>(url, token);
  },

  generateDailyPlan: (token: string) =>
    apiClient.post<DailyPlan>(API_ENDPOINTS.autonomy.dailyPlan, {}, token),

  listRules: (token: string) =>
    apiClient.get<AutonomyRulesResponse>(API_ENDPOINTS.autonomy.rules, token),

  createRule: (token: string, body: AutonomyRuleCreate) =>
    apiClient.post<AutonomyRule>(API_ENDPOINTS.autonomy.rules, body, token),

  updateRule: (token: string, id: string, body: AutonomyRuleUpdate) =>
    apiClient.patch<AutonomyRule>(API_ENDPOINTS.autonomy.rule(id), body, token),

  deleteRule: (token: string, id: string) =>
    apiClient.del(API_ENDPOINTS.autonomy.rule(id), token),

  getAuditLog: (token: string, limit = 50, offset = 0) =>
    apiClient.get<AutonomyAuditLogResponse>(
      `${API_ENDPOINTS.autonomy.auditLog}?limit=${limit}&offset=${offset}`,
      token,
    ),
};
