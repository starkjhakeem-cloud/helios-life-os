import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type EmailMessage,
  type EmailMessageCreate,
  type EmailMessageUpdate,
  emailService,
} from "../services/emailService";

type EmailState = {
  messages: EmailMessage[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchMessages: (token: string) => Promise<void>;
  createMessage: (token: string, body: EmailMessageCreate) => Promise<void>;
  updateMessage: (token: string, messageId: string, body: EmailMessageUpdate) => Promise<void>;
  deleteMessage: (token: string, messageId: string) => Promise<void>;
  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Email operation failed.";
}

export const useEmailStore = create<EmailState>()((set, get) => ({
  messages: [],
  isLoading: false,
  isMutating: false,
  error: null,

  fetchMessages: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await emailService.list(token);
      set({ messages: data.messages, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  createMessage: async (token, body) => {
    set({ isMutating: true, error: null });
    try {
      const created = await emailService.create(token, body);
      // Insert and re-sort by received_at descending (newest first).
      set((s) => ({
        messages: [created, ...s.messages].sort((a, b) =>
          b.received_at.localeCompare(a.received_at),
        ),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  updateMessage: async (token, messageId, body) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await emailService.update(token, messageId, body);
      set((s) => ({
        messages: s.messages
          .map((m) => (m.id === messageId ? updated : m))
          .sort((a, b) => b.received_at.localeCompare(a.received_at)),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  deleteMessage: async (token, messageId) => {
    // Optimistic removal.
    set((s) => ({ messages: s.messages.filter((m) => m.id !== messageId) }));
    try {
      await emailService.delete(token, messageId);
    } catch (err) {
      // Restore accurate state on failure.
      const { fetchMessages } = get();
      await fetchMessages(token);
      set({ error: extractMessage(err) });
    }
  },

  reset: () =>
    set({ messages: [], isLoading: false, isMutating: false, error: null }),
}));
