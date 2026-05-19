import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type BriefingPriority = {
  label: string;
  detail: string;
};

export type BriefingResponse = {
  summary: string;
  priorities: BriefingPriority[];
  risks: string[];
  recommendation: string;
  generated_at: string;
};

export const aiService = {
  getBriefing: (token: string) =>
    apiClient.get<BriefingResponse>(API_ENDPOINTS.ai.briefing, token),
};
