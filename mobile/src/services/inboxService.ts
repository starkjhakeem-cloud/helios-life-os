import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

export type NotificationEventType =
  | "new_suggestion"
  | "queue_item_created"
  | "approval_required"
  | "execution_blocked"
  | "execution_completed"
  | "execution_failed";

export type InboxNotification = {
  id: string;
  user_id: string;
  event_type: NotificationEventType;
  title: string;
  body: string | null;
  is_read: boolean;
  related_queue_item_id: string | null;
  action_type: string | null;
  created_at: string;
};

export type InboxListResponse = {
  notifications: InboxNotification[];
  total: number;
  unread_count: number;
};

export const inboxService = {
  list: (token: string, unreadOnly = false) =>
    apiClient.get<InboxListResponse>(
      unreadOnly
        ? `${API_ENDPOINTS.notifications.list}?unread_only=true`
        : API_ENDPOINTS.notifications.list,
      token,
    ),

  markRead: (token: string, id: string) =>
    apiClient.patch<InboxNotification>(API_ENDPOINTS.notifications.markRead(id), {}, token),

  markAllRead: (token: string) =>
    apiClient.patch<InboxListResponse>(API_ENDPOINTS.notifications.markAllRead, {}, token),

  remove: (token: string, id: string) =>
    apiClient.del(API_ENDPOINTS.notifications.delete(id), token),
};
