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

export type ChatRequest = {
  message: string;
  context_type?: string;
  related_goal_id?: string;
  related_task_id?: string;
  include_context?: boolean;
};

export type ChatApiResponse = {
  reply: string;
  suggested_actions: string[];
  follow_up_questions: string[];
  provider: string;
  generated_at: string;
};

export const aiService = {
  getBriefing: (token: string) =>
    apiClient.get<BriefingResponse>(API_ENDPOINTS.ai.briefing, token),

  generatePlan: (token: string, body: PlanRequest) =>
    apiClient.post<PlanResponse>(API_ENDPOINTS.ai.plan, body, token),

  chat: (token: string, body: ChatRequest) =>
    apiClient.post<ChatApiResponse>(API_ENDPOINTS.ai.chat, body, token),
};
