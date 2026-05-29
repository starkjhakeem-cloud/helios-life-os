import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

const BASE = API_ENDPOINTS.settings.preferences;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThemePreference = "system" | "dark" | "light";

export type PreferencesOut = {
  user_id: string;
  theme_preference: ThemePreference;
  notifications_enabled: boolean;
  reminder_notifications: boolean;
  ai_notifications: boolean;
  default_planning_horizon: number;
  updated_at: string;
};

export type PreferencesUpdate = {
  theme_preference?: ThemePreference;
  notifications_enabled?: boolean;
  reminder_notifications?: boolean;
  ai_notifications?: boolean;
  default_planning_horizon?: number;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const settingsService = {
  get: (token: string) =>
    apiClient.get<PreferencesOut>(BASE, token),

  update: (token: string, data: PreferencesUpdate) =>
    apiClient.patch<PreferencesOut>(BASE, data, token),
};
