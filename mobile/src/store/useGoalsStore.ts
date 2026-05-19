import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type CreateGoalInput,
  type Goal,
  type UpdateGoalInput,
  goalsService,
} from "../services/goalsService";

type GoalsState = {
  goals: Goal[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchGoals: (token: string) => Promise<void>;
  createGoal: (token: string, data: CreateGoalInput) => Promise<void>;
  updateGoal: (token: string, id: string, data: UpdateGoalInput) => Promise<void>;
  deleteGoal: (token: string, id: string) => Promise<void>;
  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

export const useGoalsStore = create<GoalsState>()((set, get) => ({
  goals: [],
  isLoading: false,
  isMutating: false,
  error: null,

  fetchGoals: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await goalsService.list(token);
      set({ goals: data.goals, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  createGoal: async (token, data) => {
    set({ isMutating: true, error: null });
    try {
      await goalsService.create(token, data);
      await get().fetchGoals(token);
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    } finally {
      set({ isMutating: false });
    }
  },

  updateGoal: async (token, id, data) => {
    set({ isMutating: true, error: null });
    try {
      await goalsService.update(token, id, data);
      await get().fetchGoals(token);
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    } finally {
      set({ isMutating: false });
    }
  },

  deleteGoal: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      await goalsService.delete(token, id);
      set((s) => ({ goals: s.goals.filter((g) => g.id !== id), isMutating: false }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  reset: () => set({ goals: [], isLoading: false, isMutating: false, error: null }),
}));
