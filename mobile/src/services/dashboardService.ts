import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type DashboardMetricApi = {
  value: string;
  label: string;
  icon: string;
};

export type DashboardSectionApi = {
  title: string;
  icon: string;
  content: string;
};

export type DashboardSummaryResponse = {
  metrics: DashboardMetricApi[];
  sections: DashboardSectionApi[];
  system_status: string;
  last_updated: string;
};

export const dashboardService = {
  getSummary: (token: string) =>
    apiClient.get<DashboardSummaryResponse>(API_ENDPOINTS.dashboard.summary, token),
};
