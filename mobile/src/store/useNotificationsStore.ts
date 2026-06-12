import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import { type InboxNotification, inboxService } from "../services/inboxService";

type NotificationsState = {
  notifications: InboxNotification[];
  unreadCount: number;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;

  fetchNotifications: (token: string) => Promise<void>;
  markRead: (token: string, id: string) => Promise<void>;
  markAllRead: (token: string) => Promise<void>;
  deleteNotification: (token: string, id: string) => Promise<void>;

  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  isMutating: false,
  error: null,

  fetchNotifications: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const data = await inboxService.list(token);
      set({ notifications: data.notifications, unreadCount: data.unread_count, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  markRead: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await inboxService.markRead(token, id);
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? updated : n)),
        unreadCount: Math.max(0, s.unreadCount - (s.notifications.find((n) => n.id === id)?.is_read ? 0 : 1)),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  markAllRead: async (token) => {
    set({ isMutating: true, error: null });
    try {
      const data = await inboxService.markAllRead(token);
      set({ notifications: data.notifications, unreadCount: 0, isMutating: false });
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  deleteNotification: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      await inboxService.remove(token, id);
      set((s) => {
        const removed = s.notifications.find((n) => n.id === id);
        return {
          notifications: s.notifications.filter((n) => n.id !== id),
          unreadCount: removed && !removed.is_read ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
          isMutating: false,
        };
      });
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  reset: () =>
    set({ notifications: [], unreadCount: 0, isLoading: false, isMutating: false, error: null }),
}));
