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
  createMemory: (token: string, data: MemoryCreateRequest) => Promise<void>;
  deleteMemory: (token: string, id: string) => Promise<void>;
  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
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
      await memoryService.create(token, data);
      await get().fetchMemories(token);
    } catch (err) {
      set({ error: extractMessage(err) });
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
