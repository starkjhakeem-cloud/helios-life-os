import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntegrationProvider =
  | "google_calendar"
  | "gmail"
  | "outlook_calendar"
  | "outlook_mail";

export type IntegrationStatus = "connected" | "disconnected";

export type Integration = {
  id: string | null;          // null for providers never connected
  provider: IntegrationProvider;
  status: IntegrationStatus;
  connected_at: string | null;
  last_sync_at: string | null;
  scopes: string[];
};

export type IntegrationListResponse = {
  integrations: Integration[];
};

// ── Service ───────────────────────────────────────────────────────────────────

export const integrationService = {
  list: (token: string) =>
    apiClient.get<IntegrationListResponse>(API_ENDPOINTS.integrations.base, token),

  mockConnect: (token: string, provider: IntegrationProvider) =>
    apiClient.post<Integration>(
      API_ENDPOINTS.integrations.mockConnect,
      { provider },
      token,
    ),

  disconnect: (token: string, integrationId: string) =>
    apiClient.del(API_ENDPOINTS.integrations.disconnect(integrationId), token),
};
