import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type AutonomyQueueItem,
  type AutonomyQueueItemCreate,
  type QueueStatus,
  autonomyService,
} from "../services/autonomyService";

type AutonomyState = {
  items: AutonomyQueueItem[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchQueue: (token: string, status?: QueueStatus) => Promise<void>;
  createItem: (token: string, data: AutonomyQueueItemCreate) => Promise<void>;
  approveItem: (token: string, id: string) => Promise<void>;
  rejectItem: (token: string, id: string) => Promise<void>;
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

  reset: () => set({ items: [], isLoading: false, isMutating: false, error: null }),
}));
