/**
 * locationService — automatic location and timezone detection for HELIOS.
 *
 * Two layers:
 *  1. Timezone  — always available from the JS runtime (Intl), no permission needed.
 *               Reverse geocode also returns a geographic timezone which is used
 *               when available because it's authoritative regardless of device settings.
 *  2. City/region — requires foreground location permission, uses GPS + reverse geocode.
 *
 * GPS call is guarded by a 10-second timeout so it never hangs indefinitely.
 */

import * as ExpoLocation from "expo-location";
import * as Device from "expo-device";

// ── US state abbreviation table ───────────────────────────────────────────────
// expo-location's `region` returns full state names (e.g. "New York").
// This map converts them to the 2-letter postal abbreviation used in labels.
const US_STATE_ABBREV: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX",
  Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
  "District of Columbia": "DC",
};

// Canadian province/territory abbreviations
const CA_PROVINCE_ABBREV: Record<string, string> = {
  Alberta: "AB", "British Columbia": "BC", Manitoba: "MB",
  "New Brunswick": "NB", "Newfoundland and Labrador": "NL",
  "Northwest Territories": "NT", "Nova Scotia": "NS", Nunavut: "NU",
  Ontario: "ON", "Prince Edward Island": "PE", Quebec: "QC",
  Saskatchewan: "SK", Yukon: "YT",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type DetectedLocation = {
  /** IANA timezone string, e.g. "America/New_York". */
  timezone: string;
  city: string | null;
  state: string | null;
  country: string | null;
  /** Short location label for the UI, e.g. "Brooklyn, NY" or "London, GB". */
  locationLabel: string;
  /** False when the user denied location permission. */
  permissionGranted: boolean;
  /** User-safe reason when location could not produce a trustworthy city label. */
  warningCode?: "simulator_default" | "gps_unavailable" | "reverse_geocode_unavailable";
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the device's IANA timezone from the JS runtime. Never throws. */
export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function resolveStateLabel(region: string | null, isoCountryCode: string | null): string | null {
  if (!region) return null;
  if (isoCountryCode === "US") return US_STATE_ABBREV[region] ?? region;
  if (isoCountryCode === "CA") return CA_PROVINCE_ABBREV[region] ?? region;
  return region; // Use full region name for all other countries
}

function buildLocationLabel(
  city: string | null,
  region: string | null,
  isoCountryCode: string | null,
): string {
  const parts: string[] = [];
  if (city) parts.push(city);

  const stateLabel = resolveStateLabel(region, isoCountryCode);
  // Omit state when it's the same text as the city (some islands / city-states)
  if (stateLabel && stateLabel !== city) parts.push(stateLabel);

  // For non-US/CA, append the ISO country code so the label remains unambiguous
  if (isoCountryCode && isoCountryCode !== "US" && isoCountryCode !== "CA") {
    if (!parts.some((p) => p === isoCountryCode)) parts.push(isoCountryCode);
  }

  return parts.join(", ");
}

function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radiusKm = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

function isLikelySimulatorDefault(coords: { latitude: number; longitude: number }): boolean {
  if (Device.isDevice) return false;

  const simulatorDefaults = [
    // Common iOS Simulator "San Francisco" / Expo default.
    { latitude: 37.7749, longitude: -122.4194, radiusKm: 40 },
    // Common iOS Simulator Apple Park / Cupertino default.
    { latitude: 37.3349, longitude: -122.009, radiusKm: 18 },
  ];

  return simulatorDefaults.some((spot) => distanceKm(coords, spot) <= spot.radiusKm);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Request foreground location permission and detect city/region via GPS +
 * reverse geocode. Resolves within 10 seconds regardless of GPS availability.
 */
export async function detectLocation(): Promise<DetectedLocation> {
  const deviceTimezone = getDeviceTimezone();

  const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
  if (status !== ExpoLocation.PermissionStatus.GRANTED) {
    return {
      timezone: deviceTimezone,
      city: null,
      state: null,
      country: null,
      locationLabel: "",
      permissionGranted: false,
    };
  }

  try {
    // Race GPS against a 10-second timeout to avoid hanging on cold-start.
    const pos = await Promise.race([
      ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Highest,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("GPS timeout after 15 s")), 15_000),
      ),
    ]);

    if (isLikelySimulatorDefault(pos.coords)) {
      return {
        timezone: deviceTimezone,
        city: null,
        state: null,
        country: null,
        locationLabel: "",
        permissionGranted: true,
        warningCode: "simulator_default",
      };
    }

    const results = await ExpoLocation.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });

    if (!results.length) {
      return {
        timezone: deviceTimezone,
        city: null, state: null, country: null,
        locationLabel: "",
        permissionGranted: true,
        warningCode: "reverse_geocode_unavailable",
      };
    }

    const place = results[0];
    const city = place.city ?? place.district ?? place.subregion ?? null;
    const state = place.region ?? null;
    const country = place.country ?? null;
    const isoCountryCode = place.isoCountryCode ?? null;

    // prefer the geographically authoritative timezone from the reverse geocode
    // result over the device's clock setting — they agree 99.9% of the time but
    // the geographic one is correct even if the device timezone was set manually.
    const timezone = (place as any).timezone ?? deviceTimezone;

    const locationLabel = buildLocationLabel(city, state, isoCountryCode);

    return { timezone, city, state, country, locationLabel, permissionGranted: true };
  } catch {
    // GPS unavailable or timed out — return timezone-only result so at least
    // the timezone is always saved even without a city.
    return {
      timezone: deviceTimezone,
      city: null, state: null, country: null,
      locationLabel: "",
      permissionGranted: true,
      warningCode: "gps_unavailable",
    };
  }
}

/** Check current permission status without prompting the user. */
export async function getLocationPermissionStatus(): Promise<ExpoLocation.PermissionStatus> {
  const { status } = await ExpoLocation.getForegroundPermissionsAsync();
  return status;
}
