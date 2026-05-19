import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type BriefingResponse,
  type PlanRequest,
  type PlanResponse,
  aiService,
} from "../services/aiService";

type AIState = {
  // Briefing
  briefing: BriefingResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchBriefing: (token: string) => Promise<void>;

  // Planning
  plan: PlanResponse | null;
  isPlanLoading: boolean;
  planError: string | null;
  generatePlan: (token: string, data: PlanRequest) => Promise<void>;
  clearPlan: () => void;
};

export const useAIStore = create<AIState>()((set) => ({
  briefing: null,
  isLoading: false,
  error: null,

  fetchBriefing: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await aiService.getBriefing(token);
      set({ briefing: data, isLoading: false, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load briefing.";
      set({ error: message, isLoading: false });
    }
  },

  plan: null,
  isPlanLoading: false,
  planError: null,

  generatePlan: async (token, data) => {
    set({ isPlanLoading: true, planError: null });
    try {
      const result = await aiService.generatePlan(token, data);
      set({ plan: result, isPlanLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to generate plan.";
      set({ planError: message, isPlanLoading: false });
    }
  },

  clearPlan: () => set({ plan: null, planError: null }),
}));
