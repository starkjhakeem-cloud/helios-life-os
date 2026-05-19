import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

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

  create: (token: string, body: CreateGoalInput) =>
    apiClient.post<Goal>(BASE, body, token),

  update: (token: string, id: string, body: UpdateGoalInput) =>
    apiClient.patch<Goal>(`${BASE}/${id}`, body, token),

  delete: (token: string, id: string) =>
    apiClient.del(`${BASE}/${id}`, token),
};
