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
};
