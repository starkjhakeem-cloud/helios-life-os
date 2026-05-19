import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { type BriefingResponse, aiService } from "../services/aiService";

type AIState = {
  briefing: BriefingResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchBriefing: (token: string) => Promise<void>;
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
}));
