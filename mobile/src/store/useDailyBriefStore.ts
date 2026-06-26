import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { dailyBriefService, type BackendDailyBrief } from "../services/dailyBriefService";

// ── Error codes ───────────────────────────────────────────────────────────────

// Sentinel values so the screen can render the right UI without parsing strings
export type BriefErrorCode =
  | "no_brief"        // 404 — endpoints work but no brief exists for today
  | "unavailable"     // 5xx — backend error or AI provider down
  | "network"         // connection timeout / device offline
  | "auth"            // 401 — session expired (rare; apiClient usually handles this)
  | null;

// ── State ─────────────────────────────────────────────────────────────────────

type DailyBriefState = {
  brief: BackendDailyBrief | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: BriefErrorCode;

  fetchToday: (token: string) => Promise<void>;
  generate: (token: string) => Promise<void>;
  fetchByDate: (token: string, date: string) => Promise<void>;
  reset: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function classifyError(err: unknown): BriefErrorCode {
  if (err instanceof ApiError) {
    if (err.status === 401) return "auth";
    if (err.status === 404) return "no_brief";
    if (err.status === 0)   return "network";
    return "unavailable";
  }
  return "network";
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDailyBriefStore = create<DailyBriefState>()((set) => ({
  brief: null,
  isLoading: false,
  isGenerating: false,
  error: null,

  fetchToday: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const brief = await dailyBriefService.getTodayDailyBrief(token);
      set({ brief, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: classifyError(err) });
    }
  },

  generate: async (token) => {
    set({ isGenerating: true, error: null });
    try {
      const brief = await dailyBriefService.generateDailyBrief(token);
      set({ brief, isGenerating: false });
    } catch (err) {
      set({ isGenerating: false, error: classifyError(err) });
    }
  },

  fetchByDate: async (token, date) => {
    set({ isLoading: true, error: null });
    try {
      const brief = await dailyBriefService.getDailyBriefByDate(token, date);
      set({ brief, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: classifyError(err) });
    }
  },

  reset: () => set({ brief: null, isLoading: false, isGenerating: false, error: null }),
}));
