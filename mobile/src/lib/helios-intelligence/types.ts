// ── Core entity types ─────────────────────────────────────────────────────────
// These mirror the service types but are owned by the engine so it stays
// decoupled from the API layer. Convert at the boundary (see context.ts).

export type GoalStatus = "active" | "completed" | "paused" | "planning";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface HeliosGoal {
  id: string;
  title: string;
  status: GoalStatus;
  targetDate?: string | null;
  description?: string | null;
}

export interface HeliosTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  updatedAt?: string | null;
  linkedGoalId?: string | null;
  description?: string | null;
}

export interface HeliosCalendarEvent {
  id: string;
  title: string;
  startTime: string;
  location?: string | null;
}

export interface HeliosNotification {
  id: string;
  title: string;
  body?: string | null;
  isRead: boolean;
  eventType: string;
}

// ── Intelligence context ──────────────────────────────────────────────────────

export interface HeliosIntelligenceContext {
  profile: {
    name: string;
    location: string;
    timezone: string;
  };
  goals: HeliosGoal[];
  tasks: HeliosTask[];
  calendarEvents: HeliosCalendarEvent[];
  notifications: HeliosNotification[];
  appStatus: {
    apiError: boolean;
    aiOffline: boolean;
    isSyncing: boolean;
    pendingApprovals: number;
  };
  preferences: {
    timeFormat: "12h" | "24h";
  };
  currentTime: Date;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface BriefStat {
  label: string;
  value: string;
}

export interface DailyBrief {
  title: string;
  greeting: string;
  focus: string;
  summary: string;
  stats: BriefStat[];
  recommendation: string;
  timestamp: string;
}

export interface HeroMessage {
  primary: string;
  secondary: string;
  isDefault: boolean;
}

export type AssistantStatusTone =
  | "ready"
  | "focused"
  | "needs_attention"
  | "planning"
  | "syncing"
  | "offline";

export type ColorIntent = "cyan" | "purple" | "warning" | "danger" | "muted";

export interface AssistantStatusResult {
  label: string;
  tone: AssistantStatusTone;
  colorIntent: ColorIntent;
}

export interface TodaySummary {
  completedToday: HeliosTask[];
  openTasks: HeliosTask[];
  activeGoals: HeliosGoal[];
  overdueCount: number;
  nextEvent: HeliosCalendarEvent | null;
  highestPriorityNext: HeliosTask | null;
}
