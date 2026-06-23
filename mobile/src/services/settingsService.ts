import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

const BASE = API_ENDPOINTS.settings.preferences;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThemePreference = "system" | "dark" | "light";
export type AssistantTone = "balanced" | "formal" | "casual" | "brief";
export type TimeFormat = "12h" | "24h";
export type LifeArea =
  | "school"
  | "work"
  | "family"
  | "health"
  | "finances"
  | "creative_projects"
  | "fitness"
  | "business";

export type PreferencesOut = {
  user_id: string;
  theme_preference: ThemePreference;
  notifications_enabled: boolean;
  reminder_notifications: boolean;
  ai_notifications: boolean;
  default_planning_horizon: number;
  location: string;
  // Personalization
  preferred_name: string | null;
  assistant_tone: AssistantTone;
  primary_location: string | null;
  work_focus: string | null;
  daily_brief_time: string;
  time_format: TimeFormat;
  important_life_areas: LifeArea[];
  updated_at: string;
};

export type PreferencesUpdate = {
  theme_preference?: ThemePreference;
  notifications_enabled?: boolean;
  reminder_notifications?: boolean;
  ai_notifications?: boolean;
  default_planning_horizon?: number;
  location?: string;
  // Personalization
  preferred_name?: string | null;
  assistant_tone?: AssistantTone;
  primary_location?: string | null;
  work_focus?: string | null;
  daily_brief_time?: string;
  time_format?: TimeFormat;
  important_life_areas?: LifeArea[];
};

// ── Service ───────────────────────────────────────────────────────────────────

export const settingsService = {
  get: (token: string) =>
    apiClient.get<PreferencesOut>(BASE, token),

  update: (token: string, data: PreferencesUpdate) =>
    apiClient.patch<PreferencesOut>(BASE, data, token),
};
