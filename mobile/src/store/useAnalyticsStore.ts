import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { type AnalyticsSummary, analyticsService } from "../services/analyticsService";

type AnalyticsState = {
  summary: AnalyticsSummary | null;
  isLoading: boolean;
  error: string | null;
  fetchSummary: (token: string) => Promise<void>;
};

export const useAnalyticsStore = create<AnalyticsState>()((set) => ({
  summary: null,
  isLoading: false,
  error: null,

  fetchSummary: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await analyticsService.getSummary(token);
      set({ summary: data, isLoading: false });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load analytics.";
      set({ error: message, isLoading: false });
    }
  },
}));
