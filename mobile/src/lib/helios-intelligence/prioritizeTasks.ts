import type { HeliosCalendarEvent, HeliosGoal, HeliosTask } from "./types";

// ── Category patterns ─────────────────────────────────────────────────────────
// Used to classify tasks by life area so priority bonuses can be applied.
// Order reflects the current product demo's priority model.

const WGU_RE     = /\bd278\b|wgu|study session|objective assessment|scripting|programming foundations|d\s*278/i;
const HELIOS_RE  = /helios|home screen|hero card|goals.*(redesign|screen)|calendar.*(redesign|screen)|task center|daily brief|energy core|commit.*git|git.*commit|push.*github|github.*push/i;
const PORTFOLIO_RE = /portfolio|github|resume|job.applic/i;
const CREATIVE_RE  = /gravewood|photography|character|animation|music|fashion|creative/i;
const HEALTH_RE    = /workout|fitness|exercise|health|run|gym/i;

export type TaskCategory =
  | "wgu"
  | "helios"
  | "portfolio"
  | "creative"
  | "health"
  | "general";

export function categorizeTask(task: HeliosTask): TaskCategory {
  const text = `${task.title} ${task.description ?? ""}`;
  if (WGU_RE.test(text))      return "wgu";
  if (HELIOS_RE.test(text))   return "helios";
  if (PORTFOLIO_RE.test(text)) return "portfolio";
  if (CREATIVE_RE.test(text)) return "creative";
  if (HEALTH_RE.test(text))   return "health";
  return "general";
}

// Priority bonuses by category (aligned with stated life priorities)
const CATEGORY_BONUS: Record<TaskCategory, number> = {
  wgu:       4,
  helios:    3,
  portfolio: 2,
  creative:  1,
  health:    1,
  general:   0,
};

const PRIORITY_SCORE: Record<HeliosTask["priority"], number> = {
  critical: 5,
  high:     3,
  medium:   1,
  low:      0,
};

function taskScore(task: HeliosTask): number {
  if (task.status === "done") return -100;

  const today = new Date().toISOString().split("T")[0];
  let score = 0;

  score += task.status === "in_progress" ? 10 : 0;
  score += PRIORITY_SCORE[task.priority] ?? 0;
  score += CATEGORY_BONUS[categorizeTask(task)];

  if (task.dueDate) {
    const due = task.dueDate.slice(0, 10);
    if (due < today) score += 6;       // overdue — urgent
    else if (due === today) score += 4; // due today
  } else {
    score -= 1; // no deadline is lower urgency
  }

  return score;
}

// Returns tasks sorted by urgency, highest score first, skipping done tasks.
// Future AI integration point: replace scoring with LLM-ranked priorities.
export function prioritizeTasks(
  tasks: HeliosTask[],
  _goals: HeliosGoal[],           // reserved for goal-weight integration
  _events: HeliosCalendarEvent[], // reserved for calendar-aware scheduling
): HeliosTask[] {
  return [...tasks]
    .filter((t) => t.status !== "done")
    .sort((a, b) => taskScore(b) - taskScore(a));
}
