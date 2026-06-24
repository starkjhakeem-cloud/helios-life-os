import type {
  HeliosCalendarEvent,
  HeliosGoal,
  HeliosIntelligenceContext,
  HeliosNotification,
  HeliosTask,
} from "./types";

// ── Demo context ──────────────────────────────────────────────────────────────
// Used as a fallback when real store data has not yet loaded.
// Reflects Mr. Stark's actual priorities as of June 2026.

const TODAY = new Date().toISOString().split("T")[0];

export const DEMO_CONTEXT: HeliosIntelligenceContext = {
  profile: {
    name: "Mr. Stark",
    location: "New York, NY",
    timezone: "America/New_York",
  },
  goals: [
    {
      id: "g1",
      title: "Launch HELIOS",
      status: "active",
      description:
        "Build and ship HELIOS OS. Current milestone: Home screen polish → Goals redesign → Calendar redesign → Beta launch.",
    },
    {
      id: "g2",
      title: "Graduate from WGU",
      status: "active",
      description:
        "Current course: D278 – Scripting and Programming Foundations. Next step: pass the OA.",
    },
    {
      id: "g3",
      title: "Build Software Engineering Portfolio",
      status: "active",
      description:
        "Production-quality projects, improved GitHub, resume preparation, job applications.",
    },
    {
      id: "g4",
      title: "Publish Gravewood Book One",
      status: "planning",
      description:
        "Original fiction universe. Worldbuilding complete. Chapter writing in progress.",
    },
    {
      id: "g5",
      title: "Expand Creative Portfolio",
      status: "active",
      description:
        "Photography, fashion design, animation, music production, character design.",
    },
    {
      id: "g6",
      title: "Improve Health & Fitness",
      status: "active",
      description: "Consistent workouts, improved nutrition, increased endurance.",
    },
    {
      id: "g7",
      title: "Build Financial Independence",
      status: "active",
      description: "Long-term: sustainable income through software, HELIOS, and creative work.",
    },
  ],
  tasks: [
    {
      id: "t1",
      title: "Complete a D278 study session",
      status: "todo",
      priority: "high",
      dueDate: TODAY,
      linkedGoalId: "g2",
    },
    {
      id: "t2",
      title: "Review D278 OA preparation materials",
      status: "todo",
      priority: "medium",
      dueDate: TODAY,
      linkedGoalId: "g2",
    },
    {
      id: "t3",
      title: "Finish Hero Card refinement",
      status: "in_progress",
      priority: "high",
      dueDate: TODAY,
      linkedGoalId: "g1",
    },
    {
      id: "t4",
      title: "Review Home screen UI end-to-end",
      status: "todo",
      priority: "high",
      dueDate: TODAY,
      linkedGoalId: "g1",
    },
    {
      id: "t5",
      title: "Push latest HELIOS commits to GitHub",
      status: "todo",
      priority: "medium",
      dueDate: TODAY,
      linkedGoalId: "g1",
    },
    {
      id: "t6",
      title: "Begin Goals screen redesign",
      status: "todo",
      priority: "high",
      dueDate: TODAY,
      linkedGoalId: "g1",
    },
    {
      id: "t7",
      title: "Edit one photography image",
      status: "todo",
      priority: "low",
      dueDate: TODAY,
      linkedGoalId: "g5",
    },
    {
      id: "t8",
      title: "Write additional Gravewood content",
      status: "todo",
      priority: "low",
      dueDate: TODAY,
      linkedGoalId: "g4",
    },
    {
      id: "t9",
      title: "Review GitHub repository structure",
      status: "todo",
      priority: "medium",
      dueDate: TODAY,
      linkedGoalId: "g3",
    },
    {
      id: "t10",
      title: "Workout session",
      status: "todo",
      priority: "medium",
      dueDate: TODAY,
      linkedGoalId: "g6",
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
  goals: Array<{
    id: string;
    title: string;
    status?: string | null;
    target_date?: string | null;
    description?: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status?: string | null;
    priority?: string | null;
    due_date?: string | null;
    updated_at?: string | null;
    linked_goal_id?: string | null;
    description?: string | null;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    body?: string | null;
    is_read: boolean;
    event_type: string;
  }>;
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
