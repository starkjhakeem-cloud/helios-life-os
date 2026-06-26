import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type BriefingResponse,
  type ChatRequest,
  type PlanRequest,
  type PlanResponse,
  type RecommendedAction,
  aiService,
} from "../services/aiService";

export type { RecommendedAction };

// ── Chat types ────────────────────────────────────────────────────────────────

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions: string[];
  follow_up_questions: string[];
  recommended_actions: RecommendedAction[];
  timestamp: string;
  provider?: string;
  // Backend can return context chips once the engine surfaces them
  context_sources?: string[];
  // True while the message is being streamed (partial content)
  streaming?: boolean;
};

const WELCOME: ChatMessage = {
  id: "helios-welcome",
  role: "assistant",
  content:
    "Operator online. I am HELIOS — your AI life-operating system. " +
    "I can assist with goal strategy, task prioritization, execution planning, and performance analytics. " +
    "What would you like to work on?",
  suggested_actions: [],
  follow_up_questions: [
    "What should I focus on today?",
    "Help me plan my next goal.",
    "How is my progress this week?",
  ],
  recommended_actions: [],
  timestamp: new Date().toISOString(),
};

// ── Store type ────────────────────────────────────────────────────────────────

type AIState = {
  // Briefing
  briefing: BriefingResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchBriefing: (token: string) => Promise<void>;

  // Planning
  plan: PlanResponse | null;
  isPlanLoading: boolean;
  planError: string | null;
  generatePlan: (token: string, data: PlanRequest) => Promise<void>;
  clearPlan: () => void;

  // Chat
  chatMessages: ChatMessage[];
  isChatLoading: boolean;
  chatError: string | null;
  sendMessage: (token: string, req: ChatRequest) => Promise<void>;
  clearChat: () => void;

  reset: () => void;
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAIStore = create<AIState>()((set, get) => ({
  // Briefing
  briefing: null,
  isLoading: false,
  error: null,

  fetchBriefing: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await aiService.getBriefing(token);
      set({ briefing: data, isLoading: false, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load briefing.";
      set({ error: message, isLoading: false });
    }
  },

  // Planning
  plan: null,
  isPlanLoading: false,
  planError: null,

  generatePlan: async (token, data) => {
    set({ isPlanLoading: true, planError: null });
    try {
      const result = await aiService.generatePlan(token, data);
      set({ plan: result, isPlanLoading: false });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to generate plan.";
      set({ planError: message, isPlanLoading: false });
    }
  },

  clearPlan: () => set({ plan: null, planError: null }),

  // Chat
  chatMessages: [WELCOME],
  isChatLoading: false,
  chatError: null,

  sendMessage: async (token, req) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: req.message,
      suggested_actions: [],
      follow_up_questions: [],
      recommended_actions: [],
      timestamp: new Date().toISOString(),
    };

    set((s) => ({
      chatMessages: [...s.chatMessages, userMsg],
      isChatLoading: true,
      chatError: null,
    }));

    try {
      const res = await aiService.chat(token, req);
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        suggested_actions: res.suggested_actions,
        follow_up_questions: res.follow_up_questions,
        recommended_actions: res.recommended_actions,
        timestamp: res.generated_at,
        provider: res.provider,
      };
      set((s) => ({
        chatMessages: [...s.chatMessages, assistantMsg],
        isChatLoading: false,
      }));
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to get a response. Try again.";
      set({ chatError: message, isChatLoading: false });
    }
  },

  clearChat: () => set({ chatMessages: [WELCOME], chatError: null }),

  reset: () =>
    set({
      briefing: null,
      isLoading: false,
      error: null,
      plan: null,
      isPlanLoading: false,
      planError: null,
      chatMessages: [WELCOME],
      isChatLoading: false,
      chatError: null,
    }),
}));
