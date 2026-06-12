import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type AutonomyExecuteResult,
  type AutonomyQueueItem,
  type AutonomyQueueItemCreate,
  type QueueStatus,
  autonomyService,
} from "../services/autonomyService";
import { useGoalsStore } from "./useGoalsStore";
import { useTasksStore } from "./useTasksStore";

type AutonomyState = {
  items: AutonomyQueueItem[];
  isLoading: boolean;
  isMutating: boolean;
  // Tracks which item is currently executing so the card can show a spinner.
  executingItemId: string | null;
  error: string | null;
  fetchQueue: (token: string, status?: QueueStatus) => Promise<void>;
  createItem: (token: string, data: AutonomyQueueItemCreate) => Promise<void>;
  approveItem: (token: string, id: string) => Promise<void>;
  rejectItem: (token: string, id: string) => Promise<void>;
  executeItem: (token: string, id: string) => Promise<AutonomyExecuteResult | null>;
  deleteItem: (token: string, id: string) => Promise<void>;
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
      // Optimistically mark the item completed in local state.
      set((s) => ({
        items: s.items.map((item) =>
          item.id === id ? { ...item, status: "completed" as QueueStatus } : item,
        ),
        executingItemId: null,
        isMutating: false,
      }));
      // Refresh related stores so Goals/Tasks screens reflect the change.
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

  reset: () =>
    set({
      items: [],
      isLoading: false,
      isMutating: false,
      executingItemId: null,
      error: null,
    }),
}));
