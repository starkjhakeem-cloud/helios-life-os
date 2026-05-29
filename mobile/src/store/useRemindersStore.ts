import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  reminderService,
  type ReminderCreate,
  type ReminderOut,
  type ReminderUpdate,
} from "../services/reminderService";
import {
  cancelAllReminders,
  cancelReminder,
  getPermissionStatus,
  scheduleReminder,
  type PermissionStatus,
} from "../services/notificationService";

// ── Store type ────────────────────────────────────────────────────────────────

type RemindersState = {
  reminders: ReminderOut[];
  // Maps backend reminder id → local Expo notification identifier
  localIds: Record<string, string>;
  permissionStatus: PermissionStatus;
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;

  fetchReminders: (token: string) => Promise<void>;
  createReminder: (token: string, data: ReminderCreate) => Promise<void>;
  updateReminder: (token: string, id: string, data: ReminderUpdate) => Promise<void>;
  deleteReminder: (token: string, id: string) => Promise<void>;
  refreshPermissionStatus: () => Promise<void>;
  // Cancels all local notifications then reschedules from current reminders list
  syncLocalNotifications: () => Promise<void>;
  reset: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function scheduleAll(
  reminders: ReminderOut[],
): Promise<Record<string, string>> {
  await cancelAllReminders();
  const mapping: Record<string, string> = {};
  for (const r of reminders) {
    if (!r.is_enabled) continue;
    const localId = await scheduleReminder(r.title, r.body, r.remind_at);
    if (localId) mapping[r.id] = localId;
  }
  return mapping;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useRemindersStore = create<RemindersState>()((set, get) => ({
  reminders: [],
  localIds: {},
  permissionStatus: "undetermined",
  isLoading: false,
  isMutating: false,
  error: null,

  fetchReminders: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const [resp, perm] = await Promise.all([
        reminderService.list(token),
        getPermissionStatus(),
      ]);
      const reminders = resp.reminders;
      set({ reminders, permissionStatus: perm, isLoading: false });
      // Sync local notifications in background — don't block the UI
      scheduleAll(reminders).then((localIds) => set({ localIds })).catch(() => {});
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load reminders.";
      set({ error: message, isLoading: false });
    }
  },

  createReminder: async (token, data) => {
    set({ isMutating: true, error: null });
    try {
      const reminder = await reminderService.create(token, data);
      // Schedule local notification immediately
      let newLocalIds = { ...get().localIds };
      if (reminder.is_enabled) {
        const localId = await scheduleReminder(reminder.title, reminder.body, reminder.remind_at);
        if (localId) newLocalIds[reminder.id] = localId;
      }
      set((s) => ({
        reminders: [...s.reminders, reminder].sort((a, b) =>
          a.remind_at.localeCompare(b.remind_at)
        ),
        localIds: newLocalIds,
        isMutating: false,
      }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create reminder.";
      set({ error: message, isMutating: false });
    }
  },

  updateReminder: async (token, id, data) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await reminderService.update(token, id, data);
      // Cancel existing local notification and reschedule if still enabled
      const existing = get().localIds[id];
      if (existing) await cancelReminder(existing);
      let newLocalIds = { ...get().localIds };
      delete newLocalIds[id];
      if (updated.is_enabled) {
        const localId = await scheduleReminder(updated.title, updated.body, updated.remind_at);
        if (localId) newLocalIds[id] = localId;
      }
      set((s) => ({
        reminders: s.reminders
          .map((r) => (r.id === id ? updated : r))
          .sort((a, b) => a.remind_at.localeCompare(b.remind_at)),
        localIds: newLocalIds,
        isMutating: false,
      }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to update reminder.";
      set({ error: message, isMutating: false });
    }
  },

  deleteReminder: async (token, id) => {
    set({ isMutating: true, error: null });
    try {
      await reminderService.delete(token, id);
      // Cancel local notification
      const localId = get().localIds[id];
      if (localId) await cancelReminder(localId);
      set((s) => {
        const newLocalIds = { ...s.localIds };
        delete newLocalIds[id];
        return {
          reminders: s.reminders.filter((r) => r.id !== id),
          localIds: newLocalIds,
          isMutating: false,
        };
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to delete reminder.";
      set({ error: message, isMutating: false });
    }
  },

  refreshPermissionStatus: async () => {
    const status = await getPermissionStatus();
    set({ permissionStatus: status });
  },

  syncLocalNotifications: async () => {
    const localIds = await scheduleAll(get().reminders);
    set({ localIds });
  },

  reset: () =>
    set({
      reminders: [],
      localIds: {},
      permissionStatus: "undetermined",
      isLoading: false,
      isMutating: false,
      error: null,
    }),
}));
