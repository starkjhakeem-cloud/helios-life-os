import type { SFSymbol } from "sf-symbols-typescript";
import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { dashboardService } from "../services/dashboardService";
import {
  type DashboardMetric,
  type DashboardSection,
  dashboardMetrics,
  dashboardSections,
} from "../data/dashboardData";

type DashboardState = {
  metrics: DashboardMetric[];
  sections: DashboardSection[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  fetchSummary: (token: string) => Promise<void>;
  setMetrics: (metrics: DashboardMetric[]) => void;
  setSections: (sections: DashboardSection[]) => void;
  setLoading: (isLoading: boolean) => void;
};

export const useDashboardStore = create<DashboardState>()((set) => ({
  metrics: dashboardMetrics,
  sections: dashboardSections,
  isLoading: false,
  error: null,
  lastUpdated: null,

  fetchSummary: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await dashboardService.getSummary(token);
      set({
        metrics: data.metrics.map((m) => ({ ...m, icon: m.icon as SFSymbol })),
        sections: data.sections.map((s) => ({ ...s, icon: s.icon as SFSymbol })),
        isLoading: false,
        lastUpdated: new Date(data.last_updated),
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load dashboard.";
      set({ error: message, isLoading: false });
    }
  },

  setMetrics: (metrics) => set({ metrics, lastUpdated: new Date() }),
  setSections: (sections) => set({ sections, lastUpdated: new Date() }),
  setLoading: (isLoading) => set({ isLoading }),
}));
