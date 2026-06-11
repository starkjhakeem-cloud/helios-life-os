import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type AgentCapability = {
  id: string;
  label: string;
  description: string;
};

export type AgentProfile = {
  id: string;
  name: string;
  role: string;
  description: string;
  status: string;
  priority: number;
  capabilities: AgentCapability[];
  memory_context_enabled: boolean;
};

export type AgentsResponse = {
  agents: AgentProfile[];
};

export type AgentContextSummary = {
  total_memories: number;
  active_goal_count: number;
  has_context: boolean;
};

export type AgentDetail = AgentProfile & {
  context_summary: AgentContextSummary;
};

export const agentsService = {
  listAgents: (token: string) =>
    apiClient.get<AgentsResponse>(API_ENDPOINTS.agents.list, token),

  getAgent: (token: string, agentId: string) =>
    apiClient.get<AgentDetail>(`${API_ENDPOINTS.agents.list}/${agentId}`, token),
};
