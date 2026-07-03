import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ApiError, SessionExpiredError, setTokenProvider } from "../services/apiClient";
import { authService } from "../services/authService";
import { detectLocation } from "../services/locationService";
import { useAIStore } from "./useAIStore";
import { useAgentsStore } from "./useAgentsStore";
import { useAnalyticsStore } from "./useAnalyticsStore";
import { useAutonomyStore } from "./useAutonomyStore";
import { useConversationStore } from "./useConversationStore";
import { useDashboardStore } from "./useDashboardStore";
import { useBackgroundJobsStore } from "./useBackgroundJobsStore";
import { useCalendarStore } from "./useCalendarStore";
import { useDailyBriefStore } from "./useDailyBriefStore";
import { useEmailStore } from "./useEmailStore";
import { useGoalsStore } from "./useGoalsStore";
import { useIntegrationStore } from "./useIntegrationStore";
import { useMemoryStore } from "./useMemoryStore";
import { useNotificationsStore } from "./useNotificationsStore";
import { useOrchestrationStore } from "./useOrchestrationStore";
import { useProfileStore } from "./useProfileStore";
import { useRemindersStore } from "./useRemindersStore";
import { useSettingsStore } from "./useSettingsStore";
import { useTaskEngineStore } from "./useTaskEngineStore";
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
  refreshToken: string | null;
  /**
   * Set to true when the refresh token is expired/invalid and the user must
   * sign in again. Watched by _layout.tsx to show the session-expired dialog.
   */
  sessionExpired: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<boolean>;
  clearError: () => void;
  /** Called by the apiClient interceptor. Refreshes both tokens in the store. */
  refreshSession: () => Promise<string | null>;
  /** Validates a persisted token on app start — refreshes silently if expired. */
  revalidate: () => Promise<void>;
  /** Dismiss the session-expired state (after user acknowledges and goes to login). */
  clearSessionExpired: () => void;
};

/**
 * Fire-and-forget location sync after login/signup.
 * Detects timezone (always) and city/region (if permission granted), then
 * persists both to the profile and preferences stores without blocking the
 * auth flow.
 */
async function syncLocationAfterAuth(accessToken: string): Promise<void> {
  try {
    const detected = await detectLocation();

    // detected.timezone is the geographic timezone from reverse geocode when
    // available, otherwise the device's Intl timezone — always the best value.
    const profileUpdate: Record<string, string | null> = { timezone: detected.timezone };
    if (detected.city) profileUpdate.city = detected.city;
    if (detected.state !== null) profileUpdate.state = detected.state;
    if (detected.country !== null) profileUpdate.country = detected.country;

    await useProfileStore.getState().updateProfile(accessToken, profileUpdate).catch(() => {});

    if (detected.locationLabel) {
      await useSettingsStore.getState().updatePreferences(accessToken, {
        location: detected.locationLabel,
        primary_location: detected.locationLabel,
      }).catch(() => {});
    }
  } catch {
    // Location sync is best-effort — never let it crash the auth flow.
  }
}

function resetAllStores() {
  useGoalsStore.getState().reset();
  useTasksStore.getState().reset();
  useTaskEngineStore.getState().reset();
  useAnalyticsStore.getState().reset();
  useAIStore.getState().reset();
  useDashboardStore.getState().reset();
  useAgentsStore.getState().reset();
  useConversationStore.getState().reset();
  useCalendarStore.getState().reset();
  useDailyBriefStore.getState().reset();
  useEmailStore.getState().reset();
  useIntegrationStore.getState().reset();
  useMemoryStore.getState().reset();
  useNotificationsStore.getState().reset();
  useBackgroundJobsStore.getState().reset();
  useOrchestrationStore.getState().reset();
  useRemindersStore.getState().reset();
  useSettingsStore.getState().reset();
  useAutonomyStore.getState().reset();
  useProfileStore.getState().reset();
}

function deleteAccountErrorMessage(err: unknown): string {
  if (err instanceof SessionExpiredError || (err instanceof ApiError && err.status === 401)) {
    return "Session expired. Please sign in again.";
  }
  return "Unable to delete account right now. Please try again.";
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      sessionExpired: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null, sessionExpired: false });
        try {
          const { user, access_token, refresh_token } = await authService.login(email, password);
          // Explicitly clear sessionExpired in the success path — a concurrent revalidate()
          // running with stale tokens from a previous session could set it to true while
          // this login request is in-flight; the fresh login wins.
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            sessionExpired: false,
            isLoading: false,
          });
          useSettingsStore.getState().fetchPreferences(access_token).catch(() => {});
          useProfileStore.getState().fetchProfile(access_token).catch(() => {});
          // Detect timezone + city in the background — never blocks the login flow.
          syncLocationAfterAuth(access_token);
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Login failed. Please try again.";
          set({ error: message, isLoading: false });
        }
      },

      signup: async (name, email, password) => {
        set({ isLoading: true, error: null, sessionExpired: false });
        try {
          const { user, access_token, refresh_token } = await authService.signup(
            name,
            email,
            password,
          );
          set({
            user,
            accessToken: access_token,
            refreshToken: refresh_token,
            sessionExpired: false,
            isLoading: false,
          });
          useSettingsStore.getState().fetchPreferences(access_token).catch(() => {});
          useProfileStore.getState().fetchProfile(access_token).catch(() => {});
          // Detect timezone + city in the background — never blocks the signup flow.
          syncLocationAfterAuth(access_token);
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Signup failed. Please try again.";
          set({ error: message, isLoading: false });
        }
      },

      logout: () => {
        resetAllStores();
        set({ user: null, accessToken: null, refreshToken: null, sessionExpired: false, error: null });
      },

      deleteAccount: async () => {
        const { accessToken } = get();
        if (!accessToken) return false;
        set({ isLoading: true, error: null });
        try {
          await authService.deleteAccount(accessToken);
          resetAllStores();
          set({ user: null, accessToken: null, refreshToken: null, isLoading: false, error: null });
          await AsyncStorage.clear().catch(() => {});
          return true;
        } catch (err) {
          const message = deleteAccountErrorMessage(err);
          set({ error: message, isLoading: false });
          return false;
        }
      },

      clearError: () => set({ error: null }),
      clearSessionExpired: () => set({ sessionExpired: false }),

      refreshSession: async (): Promise<string | null> => {
        const { accessToken: accessTokenAtStart, refreshToken } = get();

        if (!refreshToken) {
          // No refresh token at all. Only mark session as expired when there is
          // also no valid access token — a concurrent login() may have just stored
          // a fresh access token while this refresh attempt was queued.
          if (!get().accessToken) {
            set({ user: null, accessToken: null, refreshToken: null, sessionExpired: true });
          }
          return null;
        }

        try {
          const { user, access_token, refresh_token } = await authService.refresh(refreshToken);
          set({ user, accessToken: access_token, refreshToken: refresh_token });
          return access_token;
        } catch {
          // Before evicting the session, check if a concurrent login() succeeded
          // while this refresh was in-flight. A stale persisted access token is
          // still present during normal refresh failure, so only preserve the
          // session when the token changed after this refresh attempt started.
          const latestAccessToken = get().accessToken;
          if (latestAccessToken && latestAccessToken !== accessTokenAtStart) {
            return null;
          }

          // Refresh token is expired or invalid — the user must log in again.
          resetAllStores();
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            sessionExpired: true,
          });
          return null;
        }
      },

      revalidate: async () => {
        const { accessToken, refreshToken } = get();
        if (!accessToken && !refreshToken) {
          return;
        }

        try {
          // Try the access token first. If it's valid we get the user back.
          if (accessToken) {
            const user = await authService.me(accessToken);
            set({ user });
            // Prefetch user-specific data while we have a valid token.
            useSettingsStore.getState().fetchPreferences(accessToken).catch(() => {});
            useProfileStore.getState().fetchProfile(accessToken).catch(() => {});
            return;
          }
        } catch (err) {
          const isAuthError =
            err instanceof SessionExpiredError ||
            (err instanceof ApiError && err.status === 401);
          if (!isAuthError) {
            // Non-auth error (network down, timeout) — don't clear the session.
            return;
          }
          // The executeRequest 401 interceptor already called refreshSession() here.
          // If it set sessionExpired, bail — don't call refreshSession() a second time.
          if (get().sessionExpired) {
            return;
          }
        }

        // Access token failed AND the interceptor did not already handle refresh
        // (e.g. access token was absent but refresh token exists). Try refreshing.
        const newToken = await get().refreshSession();
        if (newToken) {
          useSettingsStore.getState().fetchPreferences(newToken).catch(() => {});
          useProfileStore.getState().fetchProfile(newToken).catch(() => {});
        }
      },
    }),
    {
      name: "helios-auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);

// Register the token provider with apiClient once, at module init time.
// useAuthStore is a module-level singleton so this is safe to do here.
setTokenProvider(() => useAuthStore.getState().refreshSession());
