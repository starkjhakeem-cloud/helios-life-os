import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type Memory,
  type MemoryCreateRequest,
  type MemoryType,
  memoryService,
} from "../services/memoryService";

type MemoryState = {
  memories: Memory[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchMemories: (token: string, memoryType?: MemoryType) => Promise<void>;
  createMemory: (token: string, data: MemoryCreateRequest) => Promise<boolean>;
  deleteMemory: (token: string, id: string) => Promise<void>;
  reset: () => void;
};

function extractMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return "HELIOS could not update memory right now. Please try again.";
  }

  if (err.status === 0) {
    return "Unable to reach HELIOS. Check your connection and try again.";
  }
  if (err.status === 401) {
    return "Your session expired. Please sign in again.";
  }
  if (err.status === 400 && err.message.toLowerCase().includes("memory limit")) {
    return "Memory is full. Delete an older memory before adding a new one.";
  }
  if (err.status === 422 || err.message.toLowerCase().includes("valid values")) {
    return "That memory could not be saved. Check the type and length, then try again.";
  }
  return "HELIOS could not update memory right now. Please try again.";
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  memories: [],
  isLoading: false,
  isMutating: false,
  error: null,

  fetchMemories: async (token, memoryType) => {
    set({ isLoading: true, error: null });
    try {
      const data = await memoryService.list(token, memoryType);
      set({ memories: data.memories, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  createMemory: async (token, data) => {
    set({ isMutating: true, error: null });
    try {
      const created = await memoryService.create(token, data);
      set((s) => ({
        memories: [created, ...s.memories.filter((memory) => memory.id !== created.id)],
      }));
      await get().fetchMemories(token);
      return true;
    } catch (err) {
      set({ error: extractMessage(err) });
      return false;
    } finally {
      set({ isMutating: false });
    }
  },

  deleteMemory: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      await memoryService.delete(token, id);
      set((s) => ({ memories: s.memories.filter((m) => m.id !== id), isMutating: false }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  reset: () => set({ memories: [], isLoading: false, isMutating: false, error: null }),
}));
