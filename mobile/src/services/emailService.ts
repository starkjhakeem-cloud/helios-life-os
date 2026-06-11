import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageImportance = "low" | "normal" | "high" | "urgent";
export type MessageStatus = "unread" | "read" | "archived";
export type MessageSource = "manual" | "gmail" | "outlook";

export type EmailMessage = {
  id: string;
  user_id: string;
  sender: string;
  subject: string;
  snippet: string | null;
  received_at: string;    // ISO 8601, e.g. "2026-06-11T09:30:00Z"
  importance: MessageImportance;
  status: MessageStatus;
  source: MessageSource;
  external_message_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailMessageCreate = {
  sender: string;
  subject: string;
  snippet?: string;
  received_at: string;
  importance?: MessageImportance;
  status?: MessageStatus;
  source?: MessageSource;
  external_message_id?: string;
};

export type EmailMessageUpdate = {
  sender?: string;
  subject?: string;
  snippet?: string;
  received_at?: string;
  importance?: MessageImportance;
  status?: MessageStatus;
  source?: MessageSource;
  external_message_id?: string;
};

export type EmailMessagesResponse = {
  messages: EmailMessage[];
  total: number;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const emailService = {
  list: (token: string) =>
    apiClient.get<EmailMessagesResponse>(API_ENDPOINTS.email.messages, token),

  create: (token: string, body: EmailMessageCreate) =>
    apiClient.post<EmailMessage>(API_ENDPOINTS.email.messages, body, token),

  update: (token: string, messageId: string, body: EmailMessageUpdate) =>
    apiClient.patch<EmailMessage>(
      `${API_ENDPOINTS.email.messages}/${messageId}`,
      body,
      token,
    ),

  delete: (token: string, messageId: string) =>
    apiClient.del(`${API_ENDPOINTS.email.messages}/${messageId}`, token),
};
