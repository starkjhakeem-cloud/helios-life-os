import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

const BASE = API_ENDPOINTS.reminders.base;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReminderOut = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  remind_at: string;   // ISO 8601 datetime string
  is_enabled: boolean;
  task_id: string | null;
  goal_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RemindersResponse = {
  reminders: ReminderOut[];
};

export type ReminderCreate = {
  title: string;
  body?: string;
  remind_at: string;
  is_enabled?: boolean;
  task_id?: string;
  goal_id?: string;
};

export type ReminderUpdate = {
  title?: string;
  body?: string;
  remind_at?: string;
  is_enabled?: boolean;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const reminderService = {
  list: (token: string) =>
    apiClient.get<RemindersResponse>(BASE, token),

  create: (token: string, body: ReminderCreate) =>
    apiClient.post<ReminderOut>(BASE, body, token),

  update: (token: string, id: string, body: ReminderUpdate) =>
    apiClient.patch<ReminderOut>(`${BASE}/${id}`, body, token),

  delete: (token: string, id: string) =>
    apiClient.del(`${BASE}/${id}`, token),
};
