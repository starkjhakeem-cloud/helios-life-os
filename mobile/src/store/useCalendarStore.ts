import { create } from "zustand";

import { ApiError } from "../services/apiClient";
import {
  type CalendarEvent,
  type CalendarEventCreate,
  type CalendarEventUpdate,
  calendarService,
} from "../services/calendarService";

type CalendarState = {
  events: CalendarEvent[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  fetchEvents: (token: string, upcomingOnly?: boolean) => Promise<void>;
  createEvent: (token: string, body: CalendarEventCreate) => Promise<void>;
  updateEvent: (token: string, eventId: string, body: CalendarEventUpdate) => Promise<void>;
  deleteEvent: (token: string, eventId: string) => Promise<void>;
  reset: () => void;
};

function extractMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Calendar operation failed.";
}

export const useCalendarStore = create<CalendarState>()((set, get) => ({
  events: [],
  isLoading: false,
  isMutating: false,
  error: null,

  fetchEvents: async (token, upcomingOnly) => {
    set({ isLoading: true, error: null });
    try {
      const data = await calendarService.list(token, upcomingOnly);
      set({ events: data.events, isLoading: false });
    } catch (err) {
      set({ error: extractMessage(err), isLoading: false });
    }
  },

  createEvent: async (token, body) => {
    set({ isMutating: true, error: null });
    try {
      const created = await calendarService.create(token, body);
      // Insert and re-sort by start_time ascending.
      set((s) => ({
        events: [...s.events, created].sort((a, b) =>
          a.start_time.localeCompare(b.start_time),
        ),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  updateEvent: async (token, eventId, body) => {
    set({ isMutating: true, error: null });
    try {
      const updated = await calendarService.update(token, eventId, body);
      set((s) => ({
        events: s.events
          .map((e) => (e.id === eventId ? updated : e))
          .sort((a, b) => a.start_time.localeCompare(b.start_time)),
        isMutating: false,
      }));
    } catch (err) {
      set({ error: extractMessage(err), isMutating: false });
    }
  },

  deleteEvent: async (token, eventId) => {
    // Optimistic removal.
    set((s) => ({ events: s.events.filter((e) => e.id !== eventId) }));
    try {
      await calendarService.delete(token, eventId);
    } catch (err) {
      // On failure, re-fetch to restore accurate state.
      const { fetchEvents } = get();
      await fetchEvents(token);
      set({ error: extractMessage(err) });
    }
  },

  reset: () =>
    set({ events: [], isLoading: false, isMutating: false, error: null }),
}));
