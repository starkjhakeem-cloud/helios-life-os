import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type MemoryType = "preference" | "important_fact" | "goal_context" | "recurring_interest";

export type Memory = {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  content: string;
  extra_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type MemoriesResponse = {
  memories: Memory[];
  total: number;
};

export type MemoryCreateRequest = {
  memory_type: MemoryType;
  content: string;
  extra_data?: Record<string, unknown> | null;
};

export const memoryService = {
  list: (token: string, memoryType?: MemoryType) => {
    const url = memoryType
      ? `${API_ENDPOINTS.ai.memory}?memory_type=${memoryType}`
      : API_ENDPOINTS.ai.memory;
    return apiClient.get<MemoriesResponse>(url, token);
  },

  create: (token: string, body: MemoryCreateRequest) =>
    apiClient.post<Memory>(API_ENDPOINTS.ai.memory, body, token),

  delete: (token: string, memoryId: string) =>
    apiClient.del(`${API_ENDPOINTS.ai.memory}/${memoryId}`, token),
};
