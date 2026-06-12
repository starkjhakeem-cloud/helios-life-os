import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type BackgroundJob,
  type BackgroundJobCreate,
  type BackgroundJobTriggerResult,
  type BackgroundJobUpdate,
  backgroundJobsService,
} from "../services/backgroundJobsService";

type BackgroundJobsState = {
  jobs: BackgroundJob[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  lastTriggerResult: BackgroundJobTriggerResult | null;

  fetchJobs: (token: string) => Promise<void>;
  createJob: (token: string, body: BackgroundJobCreate) => Promise<void>;
  updateJob: (token: string, id: string, body: BackgroundJobUpdate) => Promise<void>;
  deleteJob: (token: string, id: string) => Promise<void>;
  triggerJob: (token: string, id: string) => Promise<BackgroundJobTriggerResult | null>;

  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

export const useBackgroundJobsStore = create<BackgroundJobsState>()((set) => ({
  jobs: [],
  isLoading: false,
  isMutating: false,
  error: null,
  lastTriggerResult: null,

  fetchJobs: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await backgroundJobsService.list(token);
      set({ jobs: data.jobs, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  createJob: async (token, body) => {
    set({ isMutating: true, error: null });
    try {
      const job = await backgroundJobsService.create(token, body);
      set((s) => ({ jobs: [...s.jobs, job], isMutating: false }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  updateJob: async (token, id, body) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await backgroundJobsService.update(token, id, body);
      set((s) => ({
        jobs: s.jobs.map((j) => (j.id === id ? updated : j)),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  deleteJob: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      await backgroundJobsService.remove(token, id);
      set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id), isMutating: false }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  triggerJob: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      const result = await backgroundJobsService.trigger(token, id);
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id ? { ...j, last_run_at: result.triggered_at, status: "idle" as const } : j,
        ),
        lastTriggerResult: result,
        isMutating: false,
      }));
      return result;
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
      return null;
    }
  },

  reset: () =>
    set({ jobs: [], isLoading: false, isMutating: false, error: null, lastTriggerResult: null }),
}));
