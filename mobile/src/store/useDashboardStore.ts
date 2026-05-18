import { create } from "zustand";
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
  lastUpdated: Date | null;
  setMetrics: (metrics: DashboardMetric[]) => void;
  setSections: (sections: DashboardSection[]) => void;
  setLoading: (isLoading: boolean) => void;
};

export const useDashboardStore = create<DashboardState>()((set) => ({
  metrics: dashboardMetrics,
  sections: dashboardSections,
  isLoading: false,
  lastUpdated: null,
  setMetrics: (metrics) => set({ metrics, lastUpdated: new Date() }),
  setSections: (sections) => set({ sections, lastUpdated: new Date() }),
  setLoading: (isLoading) => set({ isLoading }),
}));
