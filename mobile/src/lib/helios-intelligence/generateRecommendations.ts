import { resolveContext } from "./context";
import { categorizeTask, prioritizeTasks } from "./prioritizeTasks";
import type { HeliosIntelligenceContext } from "./types";

// Returns a short ranked list of plain-text recommendations derived from
// the user's current context.
// Future AI integration point: pass ranked tasks to an LLM for richer output.

export function generateRecommendations(rawCtx: HeliosIntelligenceContext): string[] {
  const ctx    = resolveContext(rawCtx);
  const today  = ctx.currentTime.toISOString().split("T")[0];
  const ranked = prioritizeTasks(ctx.tasks, ctx.goals, ctx.calendarEvents);
  const recs: string[] = [];

  const wguPending   = ranked.find((t) => categorizeTask(t) === "wgu");
  const heliosPending = ranked.find((t) => categorizeTask(t) === "helios");
  const hasUnpushed   = ctx.tasks.some(
    (t) => /push.*git|git.*commit|github/i.test(t.title) && t.status !== "done",
  );
  const overdueCount  = ctx.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today,
  ).length;
  const creativePending = ranked.find((t) => categorizeTask(t) === "creative");

  if (wguPending && heliosPending) {
    recs.push(`Finish your D278 study session before continuing the ${heliosPending.title.toLowerCase()}.`);
  } else if (wguPending) {
    recs.push("Complete one focused D278 study block — consistent daily preparation is what passes the OA.");
  }

  if (heliosPending) {
    if (heliosPending.status === "in_progress") {
      recs.push(`Continue ${heliosPending.title} — it is currently in progress.`);
    } else {
      recs.push(`Your next HELIOS task is ${heliosPending.title}.`);
    }
  }

  if (hasUnpushed) {
    recs.push("Commit today's HELIOS changes to GitHub before ending your session.");
  }

  if (overdueCount > 0) {
    recs.push(
      `Review your ${overdueCount === 1 ? "overdue task" : `${overdueCount} overdue tasks`} and close anything no longer relevant.`,
    );
  }

  if (creativePending && recs.length < 4) {
    recs.push(`Reserve time for ${creativePending.title} — creative consistency builds the portfolio.`);
  }

  if (recs.length === 0) {
    recs.push("Your task list is clear. Consider reviewing your goals and planning what comes next.");
  }

  return recs.slice(0, 4);
}
