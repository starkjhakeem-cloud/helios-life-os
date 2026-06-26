import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ApiError } from "../services/apiClient";
import {
  profileService,
  type ProfileOut,
  type ProfileUpdate,
  type UserIdCheckResponse,
} from "../services/profileService";

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE: Omit<ProfileOut, "user_id" | "updated_at"> = {
  custom_user_id: null,
  user_id_changed: false,
  user_id_changed_at: null,
  can_change_user_id: true,
  first_name: null,
  last_name: null,
  display_name: null,
  display_name_change_count: 0,
  display_name_changes_remaining: 2,
  can_change_display_name: true,
  display_name_changed_at: null,
  phone_number: null,
  date_of_birth: null,
  address_line_1: null,
  address_line_2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  timezone: null,
};

// ── Store type ────────────────────────────────────────────────────────────────

type ProfileState = {
  custom_user_id: string | null;
  // True once the post-setup change slot has been consumed.
  user_id_changed: boolean;
  user_id_changed_at: string | null;
  // Convenience: true when user may still set or change the handle.
  can_change_user_id: boolean;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  display_name_change_count: number;
  display_name_changes_remaining: number;
  can_change_display_name: boolean;
  display_name_changed_at: string | null;
  phone_number: string | null;
  date_of_birth: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  timezone: string | null;

  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  fetchProfile: (token: string) => Promise<void>;
  updateProfile: (token: string, data: ProfileUpdate) => Promise<void>;
  updateUserId: (token: string, value: string) => Promise<void>;
  checkUserId: (token: string, value: string) => Promise<UserIdCheckResponse>;
  reset: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyProfile(data: ProfileOut) {
  return {
    custom_user_id: data.custom_user_id,
    user_id_changed: data.user_id_changed,
    user_id_changed_at: data.user_id_changed_at,
    can_change_user_id: data.can_change_user_id,
    first_name: data.first_name,
    last_name: data.last_name,
    display_name: data.display_name,
    display_name_change_count: data.display_name_change_count,
    display_name_changes_remaining: data.display_name_changes_remaining,
    can_change_display_name: data.can_change_display_name,
    display_name_changed_at: data.display_name_changed_at,
    phone_number: data.phone_number,
    date_of_birth: data.date_of_birth,
    address_line_1: data.address_line_1,
    address_line_2: data.address_line_2,
    city: data.city,
    state: data.state,
    postal_code: data.postal_code,
    country: data.country,
    timezone: data.timezone,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...DEFAULT_PROFILE,
      isLoading: false,
      isSaving: false,
      error: null,

      fetchProfile: async (token) => {
        set({ isLoading: true, error: null });
        try {
          const data = await profileService.get(token);
          set({ ...applyProfile(data), isLoading: false });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Failed to load profile.";
          set({ error: message, isLoading: false });
        }
      },

      updateProfile: async (token, data) => {
        set({ isSaving: true, error: null });
        try {
          const updated = await profileService.update(token, data);
          set({ ...applyProfile(updated), isSaving: false });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Failed to save profile.";
          set({ error: message, isSaving: false });
          throw err;
        }
      },

      updateUserId: async (token, value) => {
        set({ isSaving: true, error: null });
        try {
          const updated = await profileService.updateUserId(token, value);
          set({ ...applyProfile(updated), isSaving: false });
        } catch (err) {
          const message =
            err instanceof ApiError ? err.message : "Failed to update username.";
          set({ error: message, isSaving: false });
          throw err;
        }
      },

      checkUserId: async (token, value) => {
        return profileService.checkUserId(token, value);
      },

      reset: () =>
        set({
          ...DEFAULT_PROFILE,
          isLoading: false,
          isSaving: false,
          error: null,
        }),
    }),
    {
      name: "helios-profile",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        custom_user_id: s.custom_user_id,
        user_id_changed: s.user_id_changed,
        user_id_changed_at: s.user_id_changed_at,
        can_change_user_id: s.can_change_user_id,
        first_name: s.first_name,
        last_name: s.last_name,
        display_name: s.display_name,
        display_name_change_count: s.display_name_change_count,
        display_name_changes_remaining: s.display_name_changes_remaining,
        can_change_display_name: s.can_change_display_name,
        display_name_changed_at: s.display_name_changed_at,
        phone_number: s.phone_number,
        date_of_birth: s.date_of_birth,
        address_line_1: s.address_line_1,
        address_line_2: s.address_line_2,
        city: s.city,
        state: s.state,
        postal_code: s.postal_code,
        country: s.country,
        timezone: s.timezone,
      }),
    }
  )
);
