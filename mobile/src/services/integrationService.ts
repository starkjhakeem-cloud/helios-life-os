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
  token_expires_at: string | null;  // null until real OAuth tokens are stored
  scopes: string[];
};

export type IntegrationListResponse = {
  integrations: Integration[];
};

export type SyncJobOut = {
  id: string;
  integration_id: string;
  provider: string;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_created: number;
  records_updated: number;
  errors: string[];
};

export type SyncStatusResponse = {
  jobs: SyncJobOut[];
};

export type ConnectUrlResponse = {
  url: string;       // Full authorization URL or placeholder
  state: string;     // CSRF state token (not yet persisted in V2.15)
  configured: boolean; // true when GOOGLE_CLIENT_ID is set in backend config
  note: string;      // Developer note about skeleton limitations
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

  syncStatus: (token: string) =>
    apiClient.get<SyncStatusResponse>(API_ENDPOINTS.integrations.syncStatus, token),

  triggerSync: (token: string, integrationId: string) =>
    apiClient.post<SyncJobOut>(
      API_ENDPOINTS.integrations.triggerSync(integrationId),
      {},
      token,
    ),

  getConnectUrl: (token: string) =>
    apiClient.get<ConnectUrlResponse>(API_ENDPOINTS.integrations.googleConnectUrl, token),
};
