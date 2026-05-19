import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { type AgentProfile, agentsService } from "../services/agentsService";

type AgentsState = {
  agents: AgentProfile[];
  isLoading: boolean;
  error: string | null;
  fetchAgents: (token: string) => Promise<void>;
};

export const useAgentsStore = create<AgentsState>()((set) => ({
  agents: [],
  isLoading: false,
  error: null,

  fetchAgents: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await agentsService.listAgents(token);
      set({ agents: data.agents, isLoading: false, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load agents.";
      set({ error: message, isLoading: false });
    }
  },
}));
