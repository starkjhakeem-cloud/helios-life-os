import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type AgentProfile = {
  id: string;
  name: string;
  role: string;
  status: string;
  description: string;
  priority: number;
};

export type AgentsResponse = {
  agents: AgentProfile[];
};

export const agentsService = {
  listAgents: (token: string) =>
    apiClient.get<AgentsResponse>(API_ENDPOINTS.agents.list, token),
};
