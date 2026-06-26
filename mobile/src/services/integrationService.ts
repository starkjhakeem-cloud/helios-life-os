import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntegrationProvider =
  | "google_calendar"
  | "gmail"
  | "outlook_calendar"
  | "outlook_mail";

export type GoogleServiceType = "calendar" | "gmail" | "both";

export type IntegrationStatus =
  | "connected"
  | "disconnected"
  | "needs_attention"
  | "syncing"
  | "error";

export type Integration = {
  id: string | null;
  provider: IntegrationProvider;
  service_type: string | null;
  email: string | null;
  display_name: string | null;
  status: IntegrationStatus;
  connected_at: string | null;
  last_sync_at: string | null;
  token_expires_at: string | null;
  scopes: string[];
  requires_reconnect: boolean;
};

export type IntegrationListResponse = {
  integrations: Integration[];
};

export type SyncJobOut = {
  id: string;
  integration_id: string;
  provider: string;
  service_type: string | null;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_message: string | null;
  errors: string[];
};

export type SyncStatusResponse = {
  jobs: SyncJobOut[];
};

export type ConnectUrlResponse = {
  url: string;
  state: string;
  configured: boolean;
  note: string;
  service_type: string | null;
  scopes: string[];
};

export type ExchangeCodeRequest = {
  code: string;
  state?: string;
  service_type?: GoogleServiceType;
};

export type ExchangeCodeResponse = {
  success: boolean;
  provider: string;
  stub: boolean;
  tokens_stored: boolean;
  services: string[];
  note: string;
};

export type SyncSummaryOut = {
  provider: string;
  service_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_message: string | null;
  sync_job_id: string | null;
};

export type GoogleSyncResponse = {
  provider: string;
  summaries: SyncSummaryOut[];
};

export type GoogleDisconnectResponse = {
  provider: string;
  disconnected: string[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function providerToServiceType(provider: IntegrationProvider): GoogleServiceType {
  return provider === "google_calendar" ? "calendar" : "gmail";
}

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

  // Legacy connect-url (kept for backwards compat)
  getConnectUrl: (token: string) =>
    apiClient.get<ConnectUrlResponse>(API_ENDPOINTS.integrations.googleConnectUrl, token),

  // Real OAuth auth-url — returns configured Google authorization URL
  getAuthUrl: (token: string, serviceType: GoogleServiceType) =>
    apiClient.get<ConnectUrlResponse>(
      `${API_ENDPOINTS.integrations.googleAuthUrl}?service_type=${serviceType}`,
      token,
    ),

  // Reconnect URL — same endpoint, explicit semantics for re-auth flows
  getReconnectUrl: (token: string, serviceType: GoogleServiceType) =>
    apiClient.get<ConnectUrlResponse>(
      `${API_ENDPOINTS.integrations.googleReconnectUrl}?service_type=${serviceType}`,
      token,
    ),

  exchangeCode: (token: string, body: ExchangeCodeRequest) =>
    apiClient.post<ExchangeCodeResponse>(API_ENDPOINTS.integrations.googleExchange, body, token),

  // Sync via new Google-specific endpoint (supports service_type selection)
  googleSync: (token: string, serviceType: GoogleServiceType) =>
    apiClient.post<GoogleSyncResponse>(
      API_ENDPOINTS.integrations.googleSync,
      { service_type: serviceType },
      token,
    ),

  // Disconnect via new Google-specific endpoint (clears tokens, keeps row)
  googleDisconnect: (token: string, serviceType: GoogleServiceType) =>
    apiClient.post<GoogleDisconnectResponse>(
      API_ENDPOINTS.integrations.googleDisconnect,
      { service_type: serviceType },
      token,
    ),
};
