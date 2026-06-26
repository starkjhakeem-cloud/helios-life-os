import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityLevel = "low" | "medium" | "high";

export type DailyHistoryDaySummary = {
  date: string;
  day_type: string;
  has_events: boolean;
  has_tasks: boolean;
  has_focus: boolean;
  has_personal: boolean;
  activity_level: ActivityLevel;
  event_count: number;
  completed_task_count: number;
  planned_task_count: number;
  focus_minutes: number;
  brief_available: boolean;
  notes_available: boolean;
};

export type DailyHistoryMonthResponse = {
  year: number;
  month: number;
  days: DailyHistoryDaySummary[];
  total: number;
};

export type DailyHistoryOut = {
  id: string;
  user_id: string;
  date: string;
  timezone: string;
  day_type: string;
  status: string;
  summary: string | null;
  daily_brief: Record<string, unknown> | null;
  completed_tasks: Record<string, unknown>[];
  planned_tasks: Record<string, unknown>[];
  overdue_tasks: Record<string, unknown>[];
  goals_snapshot: Record<string, unknown>[];
  calendar_events: Record<string, unknown>[];
  focus_blocks: Record<string, unknown>[];
  assistant_activity: Record<string, unknown>[];
  integration_activity: Record<string, unknown>[];
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
};

// ── Service ───────────────────────────────────────────────────────────────────

class HistoryService {
  getMonthSummary(
    token: string,
    year: number,
    month: number,
  ): Promise<DailyHistoryMonthResponse> {
    return apiClient.get<DailyHistoryMonthResponse>(
      `${API_ENDPOINTS.history.month}?year=${year}&month=${month}`,
      token,
    );
  }

  getDayHistory(token: string, date: string): Promise<DailyHistoryOut> {
    return apiClient.get<DailyHistoryOut>(
      API_ENDPOINTS.history.day(date),
      token,
    );
  }

  getRange(
    token: string,
    startDate: string,
    endDate: string,
  ): Promise<{ days: DailyHistoryOut[]; total: number }> {
    return apiClient.get<{ days: DailyHistoryOut[]; total: number }>(
      `${API_ENDPOINTS.history.range}?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`,
      token,
    );
  }

  generateDayHistory(token: string, date: string): Promise<DailyHistoryOut> {
    return apiClient.post<DailyHistoryOut>(
      API_ENDPOINTS.history.generateDay(date),
      {},
      token,
    );
  }

  lockDay(token: string, date: string): Promise<DailyHistoryOut> {
    return apiClient.post<DailyHistoryOut>(
      API_ENDPOINTS.history.lockDay(date),
      {},
      token,
    );
  }

  updateNotes(
    token: string,
    date: string,
    notes: string | null,
    metadata?: Record<string, unknown> | null,
  ): Promise<DailyHistoryOut> {
    return apiClient.put<DailyHistoryOut>(
      API_ENDPOINTS.history.notes(date),
      { notes, metadata: metadata ?? null },
      token,
    );
  }
}

export const historyService = new HistoryService();
