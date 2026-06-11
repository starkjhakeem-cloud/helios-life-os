import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type OrchestrationRequest,
  type OrchestrationResponse,
  orchestrationService,
} from "../services/orchestrationService";

type OrchestrationState = {
  result: OrchestrationResponse | null;
  isLoading: boolean;
  error: string | null;
  orchestrate: (token: string, request: OrchestrationRequest) => Promise<void>;
  clearResult: () => void;
  reset: () => void;
};

export const useOrchestrationStore = create<OrchestrationState>()((set) => ({
  result: null,
  isLoading: false,
  error: null,

  orchestrate: async (token, request) => {
    set({ isLoading: true, error: null });
    try {
      const data = await orchestrationService.orchestrate(token, request);
      set({ result: data, isLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Orchestration failed. Try again.";
      set({ error: message, isLoading: false });
    }
  },

  clearResult: () => set({ result: null, error: null }),

  reset: () => set({ result: null, isLoading: false, error: null }),
}));
