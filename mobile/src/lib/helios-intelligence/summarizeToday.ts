import { resolveContext } from "./context";
import { prioritizeTasks } from "./prioritizeTasks";
import type { HeliosIntelligenceContext, TodaySummary } from "./types";

export function summarizeToday(rawCtx: HeliosIntelligenceContext): TodaySummary {
  const ctx   = resolveContext(rawCtx);
  const today = ctx.currentTime.toISOString().split("T")[0];

  const completedToday = ctx.tasks.filter((t) => {
    if (t.status !== "done" || !t.updatedAt) return false;
    return t.updatedAt.slice(0, 10) === today;
  });

  const openTasks = ctx.tasks.filter((t) => t.status !== "done");

  const activeGoals = ctx.goals.filter((g) => g.status === "active");

  const overdueCount = ctx.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today,
  ).length;

  const nextEvent =
    ctx.calendarEvents.find((e) => e.startTime >= ctx.currentTime.toISOString()) ?? null;

  const ranked = prioritizeTasks(ctx.tasks, ctx.goals, ctx.calendarEvents);
  const highestPriorityNext = ranked[0] ?? null;

  return {
    completedToday,
    openTasks,
    activeGoals,
    overdueCount,
    nextEvent,
    highestPriorityNext,
  };
}
