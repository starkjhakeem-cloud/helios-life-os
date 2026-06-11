import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { type AgentDetail, type AgentProfile, agentsService } from "../services/agentsService";

type AgentsState = {
  agents: AgentProfile[];
  selectedAgent: AgentDetail | null;
  isLoading: boolean;
  isDetailLoading: boolean;
  error: string | null;
  fetchAgents: (token: string) => Promise<void>;
  fetchAgentDetail: (token: string, agentId: string) => Promise<void>;
  clearSelectedAgent: () => void;
  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Failed to load agents.";
}

export const useAgentsStore = create<AgentsState>()((set) => ({
  agents: [],
  selectedAgent: null,
  isLoading: false,
  isDetailLoading: false,
  error: null,

  fetchAgents: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await agentsService.listAgents(token);
      set({ agents: data.agents, isLoading: false, error: null });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  fetchAgentDetail: async (token, agentId) => {
    set({ isDetailLoading: true, error: null });
    try {
      const data = await agentsService.getAgent(token, agentId);
      set({ selectedAgent: data, isDetailLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isDetailLoading: false });
    }
  },

  clearSelectedAgent: () => set({ selectedAgent: null }),

  reset: () =>
    set({ agents: [], selectedAgent: null, isLoading: false, isDetailLoading: false, error: null }),
}));
