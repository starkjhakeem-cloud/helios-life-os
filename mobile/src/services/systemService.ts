import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

export type VersionResponse = {
  version: string;
  api_version: string;
  helios_version: string;
  service: string;
};

export type DiagnosticsResponse = {
  status: string;
  service: string;
  version: string;
  api_version: string;
  environment: string;
  database: {
    status: string;
  };
  timestamp: string;
};

export const systemService = {
  health:  () => apiClient.get<HealthResponse>(API_ENDPOINTS.health),
  version: () => apiClient.get<VersionResponse>(API_ENDPOINTS.version),
  diagnostics: () => apiClient.get<DiagnosticsResponse>(API_ENDPOINTS.diagnostics),
};
