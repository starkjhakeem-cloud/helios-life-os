import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  linked_goal_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TasksListResponse = {
  tasks: Task[];
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  linked_goal_id?: string;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  due_date?: string;
  linked_goal_id?: string;
};

const BASE = API_ENDPOINTS.tasks.list;

export const tasksService = {
  list: (token: string) =>
    apiClient.get<TasksListResponse>(BASE, token),

  create: (token: string, body: CreateTaskInput) =>
    apiClient.post<Task>(BASE, body, token),

  update: (token: string, id: string, body: UpdateTaskInput) =>
    apiClient.patch<Task>(`${BASE}/${id}`, body, token),

  delete: (token: string, id: string) =>
    apiClient.del(`${BASE}/${id}`, token),
};
