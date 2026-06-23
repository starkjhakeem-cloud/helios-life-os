import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type AutonomyAuditLogEntry,
  type AutonomyExecuteResult,
  type AutonomyQueueItem,
  type AutonomyQueueItemCreate,
  type AutonomyRule,
  type AutonomyRuleCreate,
  type AutonomyRuleUpdate,
  type DailyPlan,
  type QueueStatus,
  type SuggestionItem,
  autonomyService,
} from "../services/autonomyService";
import { useGoalsStore } from "./useGoalsStore";
import { useTasksStore } from "./useTasksStore";

type AutonomyState = {
  // Queue
  items: AutonomyQueueItem[];
  isLoading: boolean;
  isMutating: boolean;
  executingItemId: string | null;
  error: string | null;

  // Suggestions
  suggestions: SuggestionItem[];
  isSuggestionsLoading: boolean;
  suggestionsError: string | null;
  // true when the backend degraded gracefully (AI failed, rule-based fallback used)
  suggestionsDegraded: boolean;
  // IDs of suggestions already promoted to the queue this session.
  queuedSuggestionIds: string[];

  // Daily plan
  dailyPlan: DailyPlan | null;
  isDailyPlanLoading: boolean;
  dailyPlanError: string | null;
  // IDs of daily plan suggested items already promoted to the queue this session.
  dailyPlanQueuedIds: string[];

  fetchQueue: (token: string, status?: QueueStatus) => Promise<void>;
  createItem: (token: string, data: AutonomyQueueItemCreate) => Promise<void>;
  approveItem: (token: string, id: string) => Promise<void>;
  rejectItem: (token: string, id: string) => Promise<void>;
  executeItem: (token: string, id: string) => Promise<AutonomyExecuteResult | null>;
  deleteItem: (token: string, id: string) => Promise<void>;

  fetchSuggestions: (token: string) => Promise<void>;
  addSuggestionToQueue: (token: string, suggestion: SuggestionItem) => Promise<void>;
  runSuggestionNow: (token: string, suggestion: SuggestionItem) => Promise<AutonomyExecuteResult | null>;

  generateDailyPlan: (token: string) => Promise<DailyPlan | null>;
  addDailyPlanItemToQueue: (token: string, item: SuggestionItem) => Promise<void>;

  // Rules
  rules: AutonomyRule[];
  isRulesLoading: boolean;
  rulesError: string | null;
  isRulesMutating: boolean;

  fetchRules: (token: string) => Promise<void>;
  createRule: (token: string, data: AutonomyRuleCreate) => Promise<void>;
  updateRule: (token: string, id: string, data: AutonomyRuleUpdate) => Promise<void>;
  deleteRule: (token: string, id: string) => Promise<void>;

  // Audit log
  auditLog: AutonomyAuditLogEntry[];
  isAuditLogLoading: boolean;
  auditLogError: string | null;

  fetchAuditLog: (token: string) => Promise<void>;

  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

export const useAutonomyStore = create<AutonomyState>()((set, get) => ({
  items: [],
  isLoading: false,
  isMutating: false,
  executingItemId: null,
  error: null,

  suggestions: [],
  isSuggestionsLoading: false,
  suggestionsError: null,
  suggestionsDegraded: false,
  queuedSuggestionIds: [],

  dailyPlan: null,
  isDailyPlanLoading: false,
  dailyPlanError: null,
  dailyPlanQueuedIds: [],

  rules: [],
  isRulesLoading: false,
  rulesError: null,
  isRulesMutating: false,

  auditLog: [],
  isAuditLogLoading: false,
  auditLogError: null,

  // ── Queue actions ─────────────────────────────────────────────────────────

  fetchQueue: async (token, status) => {
    set({ isLoading: true, error: null });
    try {
      const data = await autonomyService.list(token, status);
      set({ items: data.items, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  createItem: async (token, data) => {
    set({ isMutating: true, error: null });
    try {
      await autonomyService.create(token, data);
      await get().fetchQueue(token);
    } catch (err) {
      set({ error: extractMessage(err) });
    } finally {
      set({ isMutating: false });
    }
  },

  approveItem: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await autonomyService.updateStatus(token, id, { status: "approved" });
      set((s) => ({
        items: s.items.map((item) => (item.id === id ? updated : item)),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  rejectItem: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await autonomyService.updateStatus(token, id, { status: "rejected" });
      set((s) => ({
        items: s.items.map((item) => (item.id === id ? updated : item)),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  executeItem: async (token, id) => {
    set({ executingItemId: id, isMutating: true, error: null });
    try {
      const result = await autonomyService.execute(token, id);
      set((s) => ({
        items: s.items.map((item) =>
          item.id === id ? { ...item, status: "completed" as QueueStatus } : item,
        ),
        executingItemId: null,
        isMutating: false,
      }));
      if (
        result.action_type === "create_task" ||
        result.action_type === "update_task_status"
      ) {
        useTasksStore.getState().fetchTasks(token).catch(() => {});
      }
      if (result.action_type === "create_goal") {
        useGoalsStore.getState().fetchGoals(token).catch(() => {});
      }
      return result;
    } catch (err) {
      set({ error: extractMessage(err), executingItemId: null, isMutating: false });
      return null;
    }
  },

  deleteItem: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      await autonomyService.delete(token, id);
      set((s) => ({
        items: s.items.filter((item) => item.id !== id),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  // ── Suggestion actions ────────────────────────────────────────────────────

  fetchSuggestions: async (token) => {
    set({ isSuggestionsLoading: true, suggestionsError: null });
    try {
      const data = await autonomyService.getSuggestions(token);
      // suggestionsError stays null even when degraded — degraded means the
      // backend returned fallback suggestions successfully, not a failure.
      set({
        suggestions: data.suggestions,
        suggestionsDegraded: data.degraded ?? false,
        isSuggestionsLoading: false,
      });
    } catch (err) {
      set({ suggestionsError: extractMessage(err), isSuggestionsLoading: false });
    }
  },

  addSuggestionToQueue: async (token, suggestion) => {
    set({ isMutating: true, error: null });
    try {
      await autonomyService.create(token, {
        title: suggestion.title,
        description: suggestion.description,
        source_agent: suggestion.source_agent,
        proposed_action_type: suggestion.suggested_action_type,
        payload_preview: suggestion.payload_preview,
        risk_level: suggestion.risk_level,
      });
      set((s) => ({
        queuedSuggestionIds: [...s.queuedSuggestionIds, suggestion.id],
        isMutating: false,
      }));
      // Refresh queue so the new item appears in Pending Review immediately.
      await get().fetchQueue(token);
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  runSuggestionNow: async (token, suggestion) => {
    set({ isMutating: true, error: null });
    try {
      const queuedItem = await autonomyService.create(token, {
        title: suggestion.title,
        description: suggestion.description,
        source_agent: suggestion.source_agent,
        proposed_action_type: suggestion.suggested_action_type,
        payload_preview: suggestion.payload_preview,
        risk_level: suggestion.risk_level,
      });
      await autonomyService.updateStatus(token, queuedItem.id, { status: "approved" });
      const result = await autonomyService.execute(token, queuedItem.id);
      set((s) => ({
        queuedSuggestionIds: [...s.queuedSuggestionIds, suggestion.id],
        isMutating: false,
      }));
      await get().fetchQueue(token);
      if (
        result.action_type === "create_task" ||
        result.action_type === "update_task_status"
      ) {
        useTasksStore.getState().fetchTasks(token).catch(() => {});
      }
      if (result.action_type === "create_goal") {
        useGoalsStore.getState().fetchGoals(token).catch(() => {});
      }
      return result;
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
      return null;
    }
  },

  // ── Daily plan actions ────────────────────────────────────────────────────

  generateDailyPlan: async (token) => {
    set({ isDailyPlanLoading: true, dailyPlanError: null });
    try {
      const plan = await autonomyService.generateDailyPlan(token);
      set({ dailyPlan: plan, isDailyPlanLoading: false, dailyPlanQueuedIds: [] });
      return plan;
    } catch (err) {
      set({ dailyPlanError: extractMessage(err), isDailyPlanLoading: false });
      return null;
    }
  },

  addDailyPlanItemToQueue: async (token, item) => {
    set({ isMutating: true, error: null });
    try {
      await autonomyService.create(token, {
        title: item.title,
        description: item.description,
        source_agent: item.source_agent,
        proposed_action_type: item.suggested_action_type,
        payload_preview: item.payload_preview,
        risk_level: item.risk_level,
      });
      set((s) => ({
        dailyPlanQueuedIds: [...s.dailyPlanQueuedIds, item.id],
        isMutating: false,
      }));
      await get().fetchQueue(token);
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  // ── Rules actions ─────────────────────────────────────────────────────────

  fetchRules: async (token) => {
    set({ isRulesLoading: true, rulesError: null });
    try {
      const data = await autonomyService.listRules(token);
      set({ rules: data.rules, isRulesLoading: false });
    } catch (err) {
      set({ rulesError: extractMessage(err), isRulesLoading: false });
    }
  },

  createRule: async (token, data) => {
    set({ isRulesMutating: true, rulesError: null });
    try {
      const rule = await autonomyService.createRule(token, data);
      set((s) => ({ rules: [...s.rules, rule], isRulesMutating: false }));
    } catch (err) {
      set({ rulesError: extractMessage(err), isRulesMutating: false });
    }
  },

  updateRule: async (token, id, data) => {
    set({ isRulesMutating: true, rulesError: null });
    try {
      const updated = await autonomyService.updateRule(token, id, data);
      set((s) => ({
        rules: s.rules.map((r) => (r.id === id ? updated : r)),
        isRulesMutating: false,
      }));
    } catch (err) {
      set({ rulesError: extractMessage(err), isRulesMutating: false });
    }
  },

  deleteRule: async (token, id) => {
    set({ isRulesMutating: true, rulesError: null });
    try {
      await autonomyService.deleteRule(token, id);
      set((s) => ({
        rules: s.rules.filter((r) => r.id !== id),
        isRulesMutating: false,
      }));
    } catch (err) {
      set({ rulesError: extractMessage(err), isRulesMutating: false });
    }
  },

  // ── Audit log actions ─────────────────────────────────────────────────────

  fetchAuditLog: async (token) => {
    set({ isAuditLogLoading: true, auditLogError: null });
    try {
      const data = await autonomyService.getAuditLog(token);
      set({ auditLog: data.entries, isAuditLogLoading: false });
    } catch (err) {
      set({ auditLogError: extractMessage(err), isAuditLogLoading: false });
    }
  },

  reset: () =>
    set({
      items: [],
      isLoading: false,
      isMutating: false,
      executingItemId: null,
      error: null,
      suggestions: [],
      isSuggestionsLoading: false,
      suggestionsError: null,
      suggestionsDegraded: false,
      queuedSuggestionIds: [],
      dailyPlan: null,
      isDailyPlanLoading: false,
      dailyPlanError: null,
      dailyPlanQueuedIds: [],
      rules: [],
      isRulesLoading: false,
      rulesError: null,
      isRulesMutating: false,
      auditLog: [],
      isAuditLogLoading: false,
      auditLogError: null,
    }),
}));
