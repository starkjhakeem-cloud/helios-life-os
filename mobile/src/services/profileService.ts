import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProfileOut = {
  user_id: string;
  custom_user_id: string | null;
  user_id_changed: boolean;
  user_id_changed_at: string | null;
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
  updated_at: string;
};

export type ProfileUpdate = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  date_of_birth?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  timezone?: string | null;
};

export type UserIdCheckResponse = {
  value: string;
  available: boolean;
  // "available" | "taken" | "invalid_format" | "too_short" | "too_long" | "reserved" | "db_error"
  reason: string;
  message: string;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const profileService = {
  get: (token: string) =>
    apiClient.get<ProfileOut>(API_ENDPOINTS.profile.base, token),

  update: (token: string, data: ProfileUpdate) =>
    apiClient.patch<ProfileOut>(API_ENDPOINTS.profile.base, data, token),

  checkUserId: (token: string, value: string) =>
    apiClient.get<UserIdCheckResponse>(
      `${API_ENDPOINTS.profile.userIdCheck}?value=${encodeURIComponent(value)}`,
      token,
    ),

  updateUserId: (token: string, value: string) =>
    apiClient.patch<ProfileOut>(API_ENDPOINTS.profile.userId, { value }, token),

  changePassword: (token: string, currentPassword: string, newPassword: string) =>
    apiClient.post<void>(
      API_ENDPOINTS.profile.changePassword,
      { current_password: currentPassword, new_password: newPassword },
      token,
    ),

  changeEmail: (token: string, currentPassword: string, newEmail: string) =>
    apiClient.post<void>(
      API_ENDPOINTS.profile.changeEmail,
      { current_password: currentPassword, new_email: newEmail },
      token,
    ),
};
