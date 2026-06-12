import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ApiError } from "../services/apiClient";
import { authService } from "../services/authService";
import { useAIStore } from "./useAIStore";
import { useAgentsStore } from "./useAgentsStore";
import { useAnalyticsStore } from "./useAnalyticsStore";
import { useAutonomyStore } from "./useAutonomyStore";
import { useConversationStore } from "./useConversationStore";
import { useDashboardStore } from "./useDashboardStore";
import { useGoalsStore } from "./useGoalsStore";
import { useRemindersStore } from "./useRemindersStore";
import { useSettingsStore } from "./useSettingsStore";
import { useTasksStore } from "./useTasksStore";

export type User = {
  id: string;
  name: string;
  email: string;
  created_at?: string;
};

type AuthState = {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
  // Validates a persisted token on app start — clears session if expired.
  revalidate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { user, access_token } = await authService.login(email, password);
          set({ user, accessToken: access_token, isLoading: false });
          useSettingsStore.getState().fetchPreferences(access_token).catch(() => {});
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Login failed. Please try again.";
          set({ error: message, isLoading: false });
        }
      },

      signup: async (name, email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { user, access_token } = await authService.signup(name, email, password);
          set({ user, accessToken: access_token, isLoading: false });
          useSettingsStore.getState().fetchPreferences(access_token).catch(() => {});
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Signup failed. Please try again.";
          set({ error: message, isLoading: false });
        }
      },

      logout: () => {
        // Wipe all user-specific cached data before clearing credentials so
        // a second user logging in on the same device never sees stale data.
        useGoalsStore.getState().reset();
        useTasksStore.getState().reset();
        useAnalyticsStore.getState().reset();
        useAIStore.getState().reset();
        useDashboardStore.getState().reset();
        useAgentsStore.getState().reset();
        useConversationStore.getState().reset();
        useRemindersStore.getState().reset();
        useSettingsStore.getState().reset();
        useAutonomyStore.getState().reset();
        set({ user: null, accessToken: null, error: null });
      },

      deleteAccount: async () => {
        const { accessToken } = get();
        if (!accessToken) return;
        set({ isLoading: true, error: null });
        try {
          await authService.deleteAccount(accessToken);
          // Reuse logout to clear all local state after deletion.
          useGoalsStore.getState().reset();
          useTasksStore.getState().reset();
          useAnalyticsStore.getState().reset();
          useAIStore.getState().reset();
          useDashboardStore.getState().reset();
          useAgentsStore.getState().reset();
          useConversationStore.getState().reset();
          useRemindersStore.getState().reset();
          useSettingsStore.getState().reset();
          useAutonomyStore.getState().reset();
          set({ user: null, accessToken: null, isLoading: false, error: null });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Failed to delete account. Please try again.";
          set({ error: message, isLoading: false });
        }
      },

      clearError: () => set({ error: null }),

      revalidate: async () => {
        const { accessToken } = get();
        if (!accessToken) return;
        try {
          const user = await authService.me(accessToken);
          set({ user });
        } catch {
          // Token expired or server unreachable — clear to force re-login.
          set({ user: null, accessToken: null });
        }
      },
    }),
    {
      name: "helios-auth",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist credentials. Transient UI state (isLoading, error) is
      // intentionally excluded — it resets to defaults on every app start.
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
      }),
    }
  )
);
