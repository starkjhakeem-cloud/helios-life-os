import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ApiError } from "../services/apiClient";
import {
  settingsService,
  type PreferencesOut,
  type PreferencesUpdate,
  type ThemePreference,
} from "../services/settingsService";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_PREFS: Omit<PreferencesOut, "user_id" | "updated_at"> = {
  theme_preference: "system",
  notifications_enabled: true,
  reminder_notifications: true,
  ai_notifications: false,
  default_planning_horizon: 7,
};

// ── Store type ────────────────────────────────────────────────────────────────

type SettingsState = {
  theme_preference: ThemePreference;
  notifications_enabled: boolean;
  reminder_notifications: boolean;
  ai_notifications: boolean;
  default_planning_horizon: number;

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
            isSaving: false,
          });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Failed to save preferences.";
          // Roll back the optimistic update by re-fetching
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
      // Persist preferences only (not transient loading/error state)
      partialize: (s) => ({
        theme_preference: s.theme_preference,
        notifications_enabled: s.notifications_enabled,
        reminder_notifications: s.reminder_notifications,
        ai_notifications: s.ai_notifications,
        default_planning_horizon: s.default_planning_horizon,
      }),
    }
  )
);
