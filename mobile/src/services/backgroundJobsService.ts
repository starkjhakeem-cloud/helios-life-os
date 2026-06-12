import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type JobType =
  | "daily_briefing_generation"
  | "proactive_suggestion_scan"
  | "reminder_check"
  | "integration_sync_simulation";

export type JobStatus = "idle" | "running" | "failed";

export type BackgroundJob = {
  id: string;
  user_id: string;
  job_type: JobType;
  status: JobStatus;
  schedule_label: string;
  last_run_at: string | null;
  next_run_at: string | null;
  enabled: boolean;
  created_at: string;
};

export type BackgroundJobListResponse = {
  jobs: BackgroundJob[];
  total: number;
};

export type BackgroundJobCreate = {
  job_type: JobType;
  schedule_label: string;
  enabled?: boolean;
};

export type BackgroundJobUpdate = {
  enabled?: boolean;
  schedule_label?: string;
};

export type BackgroundJobTriggerResult = {
  job_id: string;
  job_type: JobType;
  triggered_at: string;
  result_summary: string;
  items_created: number;
};

export const backgroundJobsService = {
  list: (token: string) =>
    apiClient.get<BackgroundJobListResponse>(API_ENDPOINTS.backgroundJobs.base, token),

  create: (token: string, body: BackgroundJobCreate) =>
    apiClient.post<BackgroundJob>(API_ENDPOINTS.backgroundJobs.base, body, token),

  update: (token: string, id: string, body: BackgroundJobUpdate) =>
    apiClient.patch<BackgroundJob>(API_ENDPOINTS.backgroundJobs.item(id), body, token),

  remove: (token: string, id: string) =>
    apiClient.del(API_ENDPOINTS.backgroundJobs.item(id), token),

  trigger: (token: string, id: string) =>
    apiClient.post<BackgroundJobTriggerResult>(
      API_ENDPOINTS.backgroundJobs.trigger(id),
      {},
      token,
    ),
};
