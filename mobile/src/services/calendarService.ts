import { apiClient } from "./apiClient";
import { API_ENDPOINTS } from "../config/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventSource = "manual" | "google" | "outlook" | "ical";

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string;   // ISO 8601, e.g. "2026-06-11T10:00:00Z"
  end_time: string;     // ISO 8601
  location: string | null;
  source: EventSource;
  external_event_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEventCreate = {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  location?: string;
  source?: EventSource;
  external_event_id?: string;
};

export type CalendarEventUpdate = {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  source?: EventSource;
  external_event_id?: string;
};

export type CalendarEventsResponse = {
  events: CalendarEvent[];
  total: number;
};

// ── Service ───────────────────────────────────────────────────────────────────

export const calendarService = {
  list: (token: string, upcomingOnly?: boolean) =>
    apiClient.get<CalendarEventsResponse>(
      upcomingOnly
        ? `${API_ENDPOINTS.calendar.events}?upcoming_only=true`
        : API_ENDPOINTS.calendar.events,
      token,
    ),

  create: (token: string, body: CalendarEventCreate) =>
    apiClient.post<CalendarEvent>(API_ENDPOINTS.calendar.events, body, token),

  update: (token: string, eventId: string, body: CalendarEventUpdate) =>
    apiClient.patch<CalendarEvent>(
      `${API_ENDPOINTS.calendar.events}/${eventId}`,
      body,
      token,
    ),

  delete: (token: string, eventId: string) =>
    apiClient.del(`${API_ENDPOINTS.calendar.events}/${eventId}`, token),
};
