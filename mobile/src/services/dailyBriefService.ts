import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BackendDailyBrief = {
  date: string;
  title: string;
  greeting: string;
  summary: string;
  compact_text: string;
  calendar: Record<string, unknown>[];
  email: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  next_best_action: Record<string, unknown>;
  focus_recommendation: Record<string, unknown>;
  warnings: string[];
  insights: string[];
  generated_at: string;
  data_sources: string[];
  ai_used: boolean;
  ai_error: string | null;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const dailyBriefService = {
  getTodayDailyBrief: (token: string) =>
    apiClient.get<BackendDailyBrief>(API_ENDPOINTS.dailyBrief.today, token),

  generateDailyBrief: (token: string) =>
    apiClient.post<BackendDailyBrief>(API_ENDPOINTS.dailyBrief.generate, {}, token),

  getDailyBriefByDate: (token: string, date: string) =>
    apiClient.get<BackendDailyBrief>(API_ENDPOINTS.dailyBrief.byDate(date), token),
};
