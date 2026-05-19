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

export type PlanRequest = {
  prompt: string;
  planning_horizon_days: number;
  goal_id?: string;
};

export type PlanStep = {
  step_number: number;
  title: string;
  description: string;
  day_target: number;
};

export type PlanResponse = {
  plan_title: string;
  summary: string;
  steps: PlanStep[];
  estimated_timeline: string;
  risks: string[];
  recommendation: string;
  generated_at: string;
};

export const aiService = {
  getBriefing: (token: string) =>
    apiClient.get<BriefingResponse>(API_ENDPOINTS.ai.briefing, token),

  generatePlan: (token: string, body: PlanRequest) =>
    apiClient.post<PlanResponse>(API_ENDPOINTS.ai.plan, body, token),
};
