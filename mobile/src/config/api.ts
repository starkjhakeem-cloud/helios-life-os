export const API_CONFIG = {
  BASE_URL: __DEV__ ? "http://localhost:8000" : "https://api.helios.app",
  TIMEOUT_MS: 5000,
} as const;

export const API_ENDPOINTS = {
  health:  "/api/v1/health",
  version: "/api/v1/version",
} as const;
