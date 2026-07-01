import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  conversationService,
  type ClientClockContext,
  type ConversationSummary,
  type StoredMessage,
} from "../services/conversationService";
import type { ChatMessage, RecommendedAction } from "./useAIStore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function storedToChat(msg: StoredMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    suggested_actions: msg.suggested_actions,
    follow_up_questions: msg.follow_up_questions,
    recommended_actions: msg.recommended_actions as RecommendedAction[],
    timestamp: msg.created_at,
    provider: msg.provider ?? undefined,
  };
}

// ── Store type ────────────────────────────────────────────────────────────────

type ConversationState = {
  // Current conversation
  currentConversationId: string | null;
  currentConversationTitle: string;
  currentMessages: ChatMessage[];

  // Conversation list (for history panel)
  conversations: ConversationSummary[];

  // Loading states
  isInitializing: boolean;
  isSending: boolean;
  isLoadingHistory: boolean;

  // Errors
  initError: string | null;
  sendError: string | null;

  // Actions
  initializeConversation: (token: string) => Promise<void>;
  createNewConversation: (token: string) => Promise<void>;
  loadConversation: (token: string, id: string) => Promise<void>;
  fetchConversations: (token: string) => Promise<void>;
  sendMessage: (
    token: string,
    req: {
      message: string;
      include_context?: boolean;
      context_type?: string;
      client_clock?: ClientClockContext;
    }
  ) => Promise<void>;
  reset: () => void;
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useConversationStore = create<ConversationState>()((set, get) => ({
  currentConversationId: null,
  currentConversationTitle: "",
  currentMessages: [],
  conversations: [],
  isInitializing: false,
  isSending: false,
  isLoadingHistory: false,
  initError: null,
  sendError: null,

  initializeConversation: async (token) => {
    // Already initialized for this session — skip
    if (get().currentConversationId !== null) return;

    set({ isInitializing: true, initError: null });
    try {
      const list = await conversationService.list(token);
      set({ conversations: list });

      if (list.length > 0) {
        // Load the most recent conversation
        const detail = await conversationService.get(token, list[0].id);
        set({
          currentConversationId: detail.id,
          currentConversationTitle: detail.title,
          currentMessages: detail.messages.map(storedToChat),
          isInitializing: false,
        });
      } else {
        // No existing conversations — create the first one
        const detail = await conversationService.create(token);
        set({
          currentConversationId: detail.id,
          currentConversationTitle: detail.title,
          currentMessages: [],
          conversations: [{
            id: detail.id,
            title: detail.title,
            message_count: 0,
            created_at: detail.created_at,
            updated_at: detail.updated_at,
          }],
          isInitializing: false,
        });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to initialize conversation.";
      set({ initError: message, isInitializing: false });
    }
  },

  createNewConversation: async (token) => {
    set({ isInitializing: true, initError: null });
    try {
      const detail = await conversationService.create(token);
      set((s) => ({
        currentConversationId: detail.id,
        currentConversationTitle: detail.title,
        currentMessages: [],
        sendError: null,
        conversations: [
          {
            id: detail.id,
            title: detail.title,
            message_count: 0,
            created_at: detail.created_at,
            updated_at: detail.updated_at,
          },
          ...s.conversations,
        ],
        isInitializing: false,
      }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create conversation.";
      set({ initError: message, isInitializing: false });
    }
  },

  loadConversation: async (token, id) => {
    set({ isLoadingHistory: true });
    try {
      const detail = await conversationService.get(token, id);
      set({
        currentConversationId: detail.id,
        currentConversationTitle: detail.title,
        currentMessages: detail.messages.map(storedToChat),
        sendError: null,
        isLoadingHistory: false,
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load conversation.";
      set({ isLoadingHistory: false, initError: message });
    }
  },

  fetchConversations: async (token) => {
    try {
      const list = await conversationService.list(token);
      set({ conversations: list });
    } catch {
      // Silently ignore — the history list just won't refresh
    }
  },

  sendMessage: async (token, req) => {
    const convId = get().currentConversationId;
    if (!convId) return;

    // Optimistic user message (temp id — replaced on conversation reload)
    const tempUserMsg: ChatMessage = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: req.message,
      suggested_actions: [],
      follow_up_questions: [],
      recommended_actions: [],
      timestamp: new Date().toISOString(),
    };

    set((s) => ({
      currentMessages: [...s.currentMessages, tempUserMsg],
      isSending: true,
      sendError: null,
    }));

    try {
      const resp = await conversationService.sendMessage(token, convId, {
        message: req.message,
        include_context: req.include_context,
        context_type: req.context_type,
        client_clock: req.client_clock,
      });

      const assistantMsg = storedToChat(resp.assistant_message);

      // Update conversation title if it was just set from the first message
      set((s) => ({
        currentMessages: [...s.currentMessages, assistantMsg],
        isSending: false,
        // Refresh the title in case the backend auto-titled from this first message.
        // Identify this conversation in the list and update its title/updated_at.
        conversations: s.conversations.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: resp.user_message.created_at === resp.assistant_message.created_at
                  ? c.title
                  : c.title,
                message_count: c.message_count + 2,
                updated_at: resp.assistant_message.created_at,
              }
            : c
        ),
      }));

      // Fetch updated conversation title (in case it was auto-set from first message)
      conversationService.get(token, convId).then((detail) => {
        set((s) => ({
          currentConversationTitle: detail.title,
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, title: detail.title } : c
          ),
        }));
      }).catch(() => {});
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to get a response. Try again.";
      set({ sendError: message, isSending: false });
    }
  },

  reset: () =>
    set({
      currentConversationId: null,
      currentConversationTitle: "",
      currentMessages: [],
      conversations: [],
      isInitializing: false,
      isSending: false,
      isLoadingHistory: false,
      initError: null,
      sendError: null,
    }),
}));
