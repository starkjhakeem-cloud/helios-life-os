import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type AutonomyExecuteResult,
  type AutonomyQueueItem,
  type AutonomyQueueItemCreate,
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
  // IDs of suggestions already promoted to the queue this session.
  queuedSuggestionIds: string[];

  fetchQueue: (token: string, status?: QueueStatus) => Promise<void>;
  createItem: (token: string, data: AutonomyQueueItemCreate) => Promise<void>;
  approveItem: (token: string, id: string) => Promise<void>;
  rejectItem: (token: string, id: string) => Promise<void>;
  executeItem: (token: string, id: string) => Promise<AutonomyExecuteResult | null>;
  deleteItem: (token: string, id: string) => Promise<void>;

  fetchSuggestions: (token: string) => Promise<void>;
  addSuggestionToQueue: (token: string, suggestion: SuggestionItem) => Promise<void>;

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
  queuedSuggestionIds: [],

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
      set({ suggestions: data.suggestions, isSuggestionsLoading: false });
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
      queuedSuggestionIds: [],
    }),
}));
