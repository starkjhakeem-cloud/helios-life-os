/**
 * useLocationSync — manually re-trigger location detection from any screen.
 *
 * Detects timezone + city/region and persists both to the profile store
 * (city, state, country, timezone) and the preferences store (location label,
 * primary_location). Safe to call multiple times.
 */

import { useCallback } from "react";

import { detectLocation } from "../services/locationService";
import { useAuthStore } from "../store/useAuthStore";
import { useProfileStore } from "../store/useProfileStore";
import { useSettingsStore } from "../store/useSettingsStore";

export function useLocationSync() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);

  const syncLocation = useCallback(async () => {
    if (!accessToken) return;

    const detected = await detectLocation();

    const profileUpdate: Record<string, string | null> = {
      // detected.timezone is geographically authoritative (from reverse geocode)
      // or falls back to the device's Intl timezone — always the right value.
      timezone: detected.timezone,
    };

    if (detected.city !== null) profileUpdate.city = detected.city;
    if (detected.state !== null) profileUpdate.state = detected.state;
    if (detected.country !== null) profileUpdate.country = detected.country;

    await updateProfile(accessToken, profileUpdate).catch(() => {});

    if (detected.locationLabel) {
      await updatePreferences(accessToken, {
        location: detected.locationLabel,
        primary_location: detected.locationLabel,
      }).catch(() => {});
    }
  }, [accessToken, updateProfile, updatePreferences]);

  return { syncLocation };
}
