import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";
import type { RecommendedAction } from "./aiService";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentAssessment = {
  agent_id: string;
  agent_name: string;
  role: string;
  perspective: string;
  key_actions: string[];
  confidence: number;      // 0.0-1.0
};

export type OrchestrationRequest = {
  objective: string;
  selected_agent_ids?: string[];            // undefined = all agents
  context_scope?: "daily_briefing" | "assistant_chat" | "planning";
};

export type OrchestrationResponse = {
  objective: string;
  participating_agents: string[];           // agent names
  agent_assessments: AgentAssessment[];
  coordinated_plan: string;
  risks: string[];
  recommended_next_actions: string[];       // advisory plain-text — not auto-executed
  // Structured actions that can flow into the existing AI action review system.
  // Requires explicit operator confirmation before execution.
  actionable_recommendations: RecommendedAction[];
  context_scope: string;
  generated_at: string;
  // V3.11 — multi-agent coordination upgrade
  consensus_summary: string;
  disagreements: string[];
  overall_confidence: number;               // 0.0–1.0
};

// ── Service ───────────────────────────────────────────────────────────────────

export const orchestrationService = {
  orchestrate: (token: string, body: OrchestrationRequest) =>
    apiClient.post<OrchestrationResponse>(
      API_ENDPOINTS.agents.orchestrate,
      body,
      token,
    ),
};
