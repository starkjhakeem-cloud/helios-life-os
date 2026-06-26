import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ApiError } from "../services/apiClient";
import {
  settingsService,
  type AssistantNamePreference,
  type AssistantTone,
  type LifeArea,
  type PreferencesOut,
  type PreferencesUpdate,
  type ThemePreference,
  type TimeFormat,
} from "../services/settingsService";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: Omit<PreferencesOut, "user_id" | "updated_at"> = {
  theme_preference: "system",
  notifications_enabled: true,
  reminder_notifications: true,
  ai_notifications: false,
  default_planning_horizon: 7,
  location: "New York",
  preferred_name: null,
  assistant_name_preference: "display_name" as AssistantNamePreference,
  assistant_tone: "balanced",
  primary_location: null,
  work_focus: null,
  daily_brief_time: "08:00",
  time_format: "12h",
  important_life_areas: [],
};

// ── Store type ────────────────────────────────────────────────────────────────

type SettingsState = {
  theme_preference: ThemePreference;
  notifications_enabled: boolean;
  reminder_notifications: boolean;
  ai_notifications: boolean;
  default_planning_horizon: number;
  location: string;
  // Personalization
  preferred_name: string | null;
  assistant_name_preference: AssistantNamePreference;
  assistant_tone: AssistantTone;
  primary_location: string | null;
  work_focus: string | null;
  daily_brief_time: string;
  time_format: TimeFormat;
  important_life_areas: LifeArea[];

  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchPreferences: (token: string) => Promise<void>;
  updatePreferences: (token: string, data: PreferencesUpdate) => Promise<void>;
  reset: () => void;
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFS,
      isLoading: false,
      isSaving: false,
      error: null,

      fetchPreferences: async (token) => {
        set({ isLoading: true, error: null });
        try {
          const prefs = await settingsService.get(token);
          set({
            theme_preference: prefs.theme_preference,
            notifications_enabled: prefs.notifications_enabled,
            reminder_notifications: prefs.reminder_notifications,
            ai_notifications: prefs.ai_notifications,
            default_planning_horizon: prefs.default_planning_horizon,
            location: prefs.location,
            preferred_name: prefs.preferred_name,
            assistant_name_preference: prefs.assistant_name_preference,
            assistant_tone: prefs.assistant_tone,
            primary_location: prefs.primary_location,
            work_focus: prefs.work_focus,
            daily_brief_time: prefs.daily_brief_time,
            time_format: prefs.time_format,
            important_life_areas: prefs.important_life_areas,
            isLoading: false,
          });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Failed to load preferences.";
          set({ error: message, isLoading: false });
        }
      },

      updatePreferences: async (token, data) => {
        // Optimistic update so the UI feels instant
        set((s) => ({ ...s, ...data, isSaving: true, error: null }));
        try {
          const prefs = await settingsService.update(token, data);
          set({
            theme_preference: prefs.theme_preference,
            notifications_enabled: prefs.notifications_enabled,
            reminder_notifications: prefs.reminder_notifications,
            ai_notifications: prefs.ai_notifications,
            default_planning_horizon: prefs.default_planning_horizon,
            location: prefs.location,
            preferred_name: prefs.preferred_name,
            assistant_name_preference: prefs.assistant_name_preference,
            assistant_tone: prefs.assistant_tone,
            primary_location: prefs.primary_location,
            work_focus: prefs.work_focus,
            daily_brief_time: prefs.daily_brief_time,
            time_format: prefs.time_format,
            important_life_areas: prefs.important_life_areas,
            isSaving: false,
          });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Failed to save preferences.";
          set({ error: message, isSaving: false });
        }
      },

      reset: () =>
        set({
          ...DEFAULT_PREFS,
          isLoading: false,
          isSaving: false,
          error: null,
        }),
    }),
    {
      name: "helios-settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        theme_preference: s.theme_preference,
        notifications_enabled: s.notifications_enabled,
        reminder_notifications: s.reminder_notifications,
        ai_notifications: s.ai_notifications,
        default_planning_horizon: s.default_planning_horizon,
        location: s.location,
        preferred_name: s.preferred_name,
        assistant_name_preference: s.assistant_name_preference,
        assistant_tone: s.assistant_tone,
        primary_location: s.primary_location,
        work_focus: s.work_focus,
        daily_brief_time: s.daily_brief_time,
        time_format: s.time_format,
        important_life_areas: s.important_life_areas,
      }),
    }
  )
);
