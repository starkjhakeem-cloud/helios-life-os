import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type CreateTaskInput,
  type Task,
  type UpdateTaskInput,
  tasksService,
} from "../services/tasksService";

type TasksState = {
  tasks: Task[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchTasks: (token: string) => Promise<void>;
  createTask: (token: string, data: CreateTaskInput) => Promise<void>;
  updateTask: (token: string, id: string, data: UpdateTaskInput) => Promise<void>;
  deleteTask: (token: string, id: string) => Promise<void>;
  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

export const useTasksStore = create<TasksState>()((set, get) => ({
  tasks: [],
  isLoading: false,
  isMutating: false,
  error: null,

  fetchTasks: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await tasksService.list(token);
      set({ tasks: data.tasks, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  createTask: async (token, data) => {
    set({ isMutating: true, error: null });
    try {
      await tasksService.create(token, data);
      await get().fetchTasks(token);
    } catch (err) {
      set({ error: extractMessage(err) });
    } finally {
      set({ isMutating: false });
    }
  },

  updateTask: async (token, id, data) => {
    set({ isMutating: true, error: null });
    try {
      await tasksService.update(token, id, data);
      await get().fetchTasks(token);
    } catch (err) {
      set({ error: extractMessage(err) });
    } finally {
      set({ isMutating: false });
    }
  },

  deleteTask: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      await tasksService.delete(token, id);
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), isMutating: false }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  reset: () => set({ tasks: [], isLoading: false, isMutating: false, error: null }),
}));
