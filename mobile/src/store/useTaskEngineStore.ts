import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type AcceptSuggestionRequest,
  type ScheduleTaskRequest,
  type TaskSuggestion,
  taskEngineService,
} from "../services/taskEngineService";

// ── Store type ────────────────────────────────────────────────────────────────

type TaskEngineState = {
  suggestions: TaskSuggestion[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;

  fetchSuggestions: (token: string) => Promise<void>;
  generateSuggestions: (token: string) => Promise<void>;
  acceptSuggestion: (token: string, id: string, req?: AcceptSuggestionRequest) => Promise<void>;
  rejectSuggestion: (token: string, id: string, reason?: string) => Promise<void>;
  scheduleTask: (token: string, taskId: string, req?: ScheduleTaskRequest) => Promise<{ calendarEvent: Record<string, unknown> | null }>;
  // Enhanced complete — calls task-engine endpoint so completion is tracked in history
  completeTaskViaEngine: (token: string, taskId: string) => Promise<{ goalProgress: Record<string, unknown> | null }>;
  clearError: () => void;
  reset: () => void;
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTaskEngineStore = create<TaskEngineState>()((set, get) => ({
  suggestions: [],
  isLoading: false,
  isGenerating: false,
  error: null,

  fetchSuggestions: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await taskEngineService.getSuggestions(token);
      // Only show pending suggestions
      const pending = data.suggestions.filter((s) => s.status === "pending");
      set({ suggestions: pending, isLoading: false });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't load suggestions.";
      set({ error: msg, isLoading: false });
    }
  },

  generateSuggestions: async (token) => {
    set({ isGenerating: true, error: null });
    try {
      const data = await taskEngineService.generateSuggestions(token, 5);
      const pending = data.suggestions.filter((s) => s.status === "pending");
      set({ suggestions: pending, isGenerating: false });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't generate suggestions.";
      set({ error: msg, isGenerating: false });
    }
  },

  acceptSuggestion: async (token, id, req = {}) => {
    // Optimistically remove from list so it doesn't linger
    set((s) => ({ suggestions: s.suggestions.filter((sg) => sg.id !== id) }));
    try {
      await taskEngineService.acceptSuggestion(token, id, req);
    } catch (err) {
      // Restore the suggestion if accept failed
      const msg = err instanceof ApiError ? err.message : "Couldn't accept suggestion.";
      set({ error: msg });
      // Re-fetch to get accurate state
      get().fetchSuggestions(token).catch(() => {});
    }
  },

  rejectSuggestion: async (token, id, reason) => {
    set((s) => ({ suggestions: s.suggestions.filter((sg) => sg.id !== id) }));
    try {
      await taskEngineService.rejectSuggestion(token, id, reason);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't dismiss suggestion.";
      set({ error: msg });
      get().fetchSuggestions(token).catch(() => {});
    }
  },

  scheduleTask: async (token, taskId, req = {}) => {
    try {
      const res = await taskEngineService.scheduleTask(token, taskId, req);
      return { calendarEvent: res.calendar_event };
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't schedule task.";
      set({ error: msg });
      return { calendarEvent: null };
    }
  },

  completeTaskViaEngine: async (token, taskId) => {
    try {
      const res = await taskEngineService.completeTask(token, taskId);
      return { goalProgress: res.goal_progress };
    } catch {
      // Non-fatal — caller falls back to regular PATCH update
      return { goalProgress: null };
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set({ suggestions: [], isLoading: false, isGenerating: false, error: null }),
}));
