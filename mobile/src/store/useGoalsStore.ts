import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type CreateGoalInput,
  type Goal,
  type GoalProgress,
  type UpdateGoalInput,
  goalsService,
} from "../services/goalsService";
import type { Task } from "../services/tasksService";

type GoalsState = {
  goals: Goal[];
  selectedGoal: Goal | null;
  selectedGoalTasks: Task[];
  goalProgressById: Record<string, GoalProgress>;
  isLoading: boolean;
  isDetailLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchGoals: (token: string) => Promise<void>;
  fetchGoalDetail: (token: string, id: string) => Promise<void>;
  fetchGoalProgress: (token: string, id: string) => Promise<void>;
  fetchLinkedTasks: (token: string, id: string) => Promise<void>;
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
  selectedGoal: null,
  selectedGoalTasks: [],
  goalProgressById: {},
  isLoading: false,
  isDetailLoading: false,
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

  fetchGoalDetail: async (token, id) => {
    set({ isDetailLoading: true, error: null });
    try {
      const [goal, tasks, progress] = await Promise.all([
        goalsService.detail(token, id),
        goalsService.linkedTasks(token, id),
        goalsService.progress(token, id),
      ]);
      set((s) => ({
        selectedGoal: goal,
        selectedGoalTasks: tasks.tasks,
        goalProgressById: { ...s.goalProgressById, [id]: progress },
        isDetailLoading: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isDetailLoading: false });
    }
  },

  fetchGoalProgress: async (token, id) => {
    try {
      const progress = await goalsService.progress(token, id);
      set((s) => ({ goalProgressById: { ...s.goalProgressById, [id]: progress } }));
    } catch (err) {
      set({ error: extractMessage(err) });
    }
  },

  fetchLinkedTasks: async (token, id) => {
    set({ isDetailLoading: true, error: null });
    try {
      const data = await goalsService.linkedTasks(token, id);
      set({ selectedGoalTasks: data.tasks, isDetailLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isDetailLoading: false });
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

  reset: () => set({
    goals: [],
    selectedGoal: null,
    selectedGoalTasks: [],
    goalProgressById: {},
    isLoading: false,
    isDetailLoading: false,
    isMutating: false,
    error: null,
  }),
}));
