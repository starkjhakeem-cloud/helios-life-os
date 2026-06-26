import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";
import type { TasksListResponse } from "./tasksService";

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  target_date: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalsListResponse = {
  goals: Goal[];
};

export type GoalProgress = {
  goal_id: string;
  goal_title: string;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
  computed_progress: number;
  manual_progress: number | null;
  effective_progress: number;
};

export type CreateGoalInput = {
  title: string;
  description?: string;
  status?: string;
  target_date?: string;
};

export type UpdateGoalInput = {
  title?: string;
  description?: string;
  status?: string;
  target_date?: string;
};

const BASE = API_ENDPOINTS.goals.list;

export const goalsService = {
  list: (token: string) =>
    apiClient.get<GoalsListResponse>(BASE, token),

  detail: (token: string, id: string) =>
    apiClient.get<Goal>(API_ENDPOINTS.goals.detail(id), token),

  linkedTasks: (token: string, id: string) =>
    apiClient.get<TasksListResponse>(API_ENDPOINTS.goals.linkedTasks(id), token),

  progress: (token: string, id: string) =>
    apiClient.get<GoalProgress>(API_ENDPOINTS.relationships.goalProgress(id), token),

  create: (token: string, body: CreateGoalInput) =>
    apiClient.post<Goal>(BASE, body, token),

  update: (token: string, id: string, body: UpdateGoalInput) =>
    apiClient.patch<Goal>(`${BASE}/${id}`, body, token),

  delete: (token: string, id: string) =>
    apiClient.del(`${BASE}/${id}`, token),
};
