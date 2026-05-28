import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

const BASE = API_ENDPOINTS.conversations.base;

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConversationSummary = {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_actions: string[];
  follow_up_questions: string[];
  recommended_actions: Record<string, unknown>[];
  provider: string | null;
  created_at: string;
};

export type ConversationDetail = {
  id: string;
  title: string;
  messages: StoredMessage[];
  created_at: string;
  updated_at: string;
};

export type MessageRequest = {
  message: string;
  context_type?: string;
  include_context?: boolean;
};

export type MessageResponse = {
  user_message: StoredMessage;
  assistant_message: StoredMessage;
  conversation_id: string;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const conversationService = {
  list: (token: string) =>
    apiClient.get<ConversationSummary[]>(BASE, token),

  create: (token: string) =>
    apiClient.post<ConversationDetail>(BASE, {}, token),

  get: (token: string, id: string) =>
    apiClient.get<ConversationDetail>(`${BASE}/${id}`, token),

  sendMessage: (token: string, id: string, body: MessageRequest) =>
    apiClient.post<MessageResponse>(`${BASE}/${id}/messages`, body, token),
};
