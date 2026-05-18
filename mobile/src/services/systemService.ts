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
  service: string;
};

export const systemService = {
  health:  () => apiClient.get<HealthResponse>(API_ENDPOINTS.health),
  version: () => apiClient.get<VersionResponse>(API_ENDPOINTS.version),
};
