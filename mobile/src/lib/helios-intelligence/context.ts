import type {
  HeliosCalendarEvent,
  HeliosGoal,
  HeliosIntelligenceContext,
  HeliosNotification,
  HeliosTask,
} from "./types";

// ── Demo context ──────────────────────────────────────────────────────────────
// Used as a fallback when real store data has not yet loaded.
// Uses neutral placeholder data so public demo states never expose personal context.

const TODAY = new Date().toISOString().split("T")[0];

export const DEMO_CONTEXT: HeliosIntelligenceContext = {
  profile: {
    name: "Alex Demo",
    location: "Austin, TX",
    timezone: "America/Chicago",
  },
  goals: [
    {
      id: "g1",
      title: "Launch HELIOS Beta",
      status: "active",
      description:
        "Prepare a polished private beta with clean onboarding, stable integrations, and clear demo materials.",
    },
    {
      id: "g2",
      title: "Build Portfolio Case Study",
      status: "active",
      description:
        "Turn HELIOS into a recruiter-ready product story with screenshots, architecture notes, and a concise walkthrough.",
    },
    {
      id: "g3",
      title: "Improve Weekly Health Rhythm",
      status: "active",
      description: "Keep a steady workout and sleep routine while finishing the beta sprint.",
    },
    {
      id: "g4",
      title: "Plan Product Launch Content",
      status: "active",
      description:
        "Draft a landing-page narrative, demo script, and launch checklist for early testers.",
    },
  ],
  tasks: [
    {
      id: "t1",
      title: "Review Home and Assistant flows",
      status: "in_progress",
      priority: "high",
      dueDate: TODAY,
      linkedGoalId: "g1",
    },
    {
      id: "t2",
      title: "Capture final README screenshots",
      status: "todo",
      priority: "high",
      dueDate: TODAY,
      linkedGoalId: "g2",
    },
    {
      id: "t3",
      title: "Draft beta tester checklist",
      status: "todo",
      priority: "medium",
      dueDate: TODAY,
      linkedGoalId: "g1",
    },
    {
      id: "t4",
      title: "Schedule recovery workout",
      status: "todo",
      priority: "medium",
      dueDate: TODAY,
      linkedGoalId: "g3",
    },
  ],
  calendarEvents: [],
  notifications: [],
  appStatus: {
    apiError: false,
    aiOffline: false,
    isSyncing: false,
    pendingApprovals: 0,
  },
  preferences: { timeFormat: "12h" },
  currentTime: new Date(),
};

// ── Context builder ───────────────────────────────────────────────────────────
// Converts raw store data into the engine's context shape.
// Called at the boundary in the Home screen — keeps the engine itself
// free of any dependency on Zustand or API types.
//
// When real data is absent (empty arrays from an unauthenticated or
// loading state), the engine falls back to DEMO_CONTEXT automatically
// inside each generator via the useDemoFallback helper.

export function buildIntelligenceContext(input: {
  goals: {
    id: string;
    title: string;
    status?: string | null;
    target_date?: string | null;
    description?: string | null;
  }[];
  tasks: {
    id: string;
    title: string;
    status?: string | null;
    priority?: string | null;
    due_date?: string | null;
    updated_at?: string | null;
    linked_goal_id?: string | null;
    description?: string | null;
  }[];
  notifications: {
    id: string;
    title: string;
    body?: string | null;
    is_read: boolean;
    event_type: string;
  }[];
  calendarEvents?: HeliosCalendarEvent[];
  profile: { name: string; location: string; timezone: string };
  appStatus: {
    apiError: boolean;
    aiOffline: boolean;
    isSyncing: boolean;
    pendingApprovals: number;
  };
  preferences: { timeFormat: "12h" | "24h" };
  currentTime: Date;
}): HeliosIntelligenceContext {
  const goals: HeliosGoal[] = input.goals.map((g) => ({
    id: g.id,
    title: g.title,
    status: (g.status as HeliosGoal["status"]) ?? "active",
    targetDate: g.target_date ?? null,
    description: g.description ?? null,
  }));

  const tasks: HeliosTask[] = input.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: (t.status as HeliosTask["status"]) ?? "todo",
    priority: (t.priority as HeliosTask["priority"]) ?? "medium",
    dueDate: t.due_date ?? null,
    updatedAt: t.updated_at ?? null,
    linkedGoalId: t.linked_goal_id ?? null,
    description: t.description ?? null,
  }));

  const notifications: HeliosNotification[] = input.notifications.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body ?? null,
    isRead: n.is_read,
    eventType: n.event_type,
  }));

  return {
    profile: input.profile,
    goals,
    tasks,
    calendarEvents: input.calendarEvents ?? [],
    notifications,
    appStatus: input.appStatus,
    preferences: input.preferences,
    currentTime: input.currentTime,
  };
}

// ── Fallback helper ───────────────────────────────────────────────────────────
// Returns DEMO_CONTEXT (with updated currentTime) when real context has no
// meaningful data. Allows generators to behave correctly on first load.

export function resolveContext(ctx: HeliosIntelligenceContext): HeliosIntelligenceContext {
  const hasRealData = ctx.goals.length > 0 || ctx.tasks.length > 0;
  if (hasRealData) return ctx;
  return { ...DEMO_CONTEXT, currentTime: ctx.currentTime };
}
