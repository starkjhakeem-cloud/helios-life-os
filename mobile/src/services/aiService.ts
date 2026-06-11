import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type BriefingPriority = {
  label: string;
  detail: string;
};

export type BriefingResponse = {
  greeting: string;
  summary: string;
  priorities: BriefingPriority[];
  risks: string[];
  focus_block: string;
  recommended_agent: string;
  // Email-aware fields — present when UNREAD MESSAGES context was available.
  email_summary: string | null;
  important_emails: string[];
  email_risks: string[];
  suggested_email_actions: string[];
  // V2.9 — which data sources the context engine included for this briefing.
  context_sources: string[];
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

export type RecommendedAction = {
  id: string;
  type: "create_task" | "update_task_status" | "create_goal" | "prioritize_tasks" | "generate_plan";
  title: string;
  description: string;
  confidence: number;
  payload_preview: Record<string, unknown>;
  // Structured payload for actual backend execution; null for non-executable types.
  execution_payload?: Record<string, unknown> | null;
};

export type ChatApiResponse = {
  reply: string;
  suggested_actions: string[];
  follow_up_questions: string[];
  recommended_actions: RecommendedAction[];
  provider: string;
  generated_at: string;
};

export type ActionExecuteRequest = {
  action_type: "create_task" | "update_task_status" | "create_goal";
  payload: Record<string, unknown>;
};

export type ActionExecuteResult = {
  success: boolean;
  action_type: string;
  message: string;
  created_or_updated_id?: string;
  executed_at: string;
};

export const aiService = {
  getBriefing: (token: string) =>
    apiClient.get<BriefingResponse>(API_ENDPOINTS.ai.briefing, token),

  generatePlan: (token: string, body: PlanRequest) =>
    apiClient.post<PlanResponse>(API_ENDPOINTS.ai.plan, body, token),

  chat: (token: string, body: ChatRequest) =>
    apiClient.post<ChatApiResponse>(API_ENDPOINTS.ai.chat, body, token),

  executeAction: (token: string, body: ActionExecuteRequest) =>
    apiClient.post<ActionExecuteResult>(API_ENDPOINTS.ai.execute, body, token),
};
