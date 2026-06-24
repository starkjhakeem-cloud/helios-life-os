import { resolveContext } from "./context";
import { categorizeTask, prioritizeTasks } from "./prioritizeTasks";
import type { BriefStat, DailyBrief, HeliosIntelligenceContext, HeliosTask } from "./types";

// ── Greeting ──────────────────────────────────────────────────────────────────

function getGreeting(date: Date, name: string): string {
  const h = date.getHours();
  const salutation = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return `${salutation}, ${name}.`;
}

// ── Focus sentence ────────────────────────────────────────────────────────────
// Answers "What should I focus on today?" using the top-ranked tasks.
// Future AI integration point: replace this function with an LLM call.

function buildFocusSentence(ranked: HeliosTask[]): string {
  if (ranked.length === 0) {
    return "Today is a good day to review your goals and plan your next move.";
  }

  const top = ranked[0];
  const second = ranked[1] ?? null;
  const topCat = categorizeTask(top);
  const secCat = second ? categorizeTask(second) : null;

  if (topCat === "wgu" && secCat === "helios") {
    return "Today's highest priority is preparing for your D278 Objective Assessment while continuing development of HELIOS.";
  }
  if (topCat === "wgu") {
    return "Today's highest priority is your D278 study session — keep OA preparation active and consistent.";
  }
  if (topCat === "helios" && secCat === "wgu") {
    return "HELIOS development is in progress, but your D278 study session should be completed before continuing.";
  }
  if (topCat === "helios") {
    return `Today's development priority is HELIOS — ${top.title.toLowerCase()}.`;
  }
  if (topCat === "portfolio") {
    return `Your highest-impact next step is portfolio work: ${top.title}.`;
  }
  if (topCat === "creative") {
    return `Today includes time for creative work: ${top.title}.`;
  }

  return `Today's highest priority is: ${top.title}.`;
}

// ── Recommendation ────────────────────────────────────────────────────────────
// Answers "What should I do next?" — one specific, actionable sentence.

function buildRecommendation(ranked: HeliosTask[]): string {
  const wguTask   = ranked.find((t) => categorizeTask(t) === "wgu");
  const heliosTask = ranked.find((t) => categorizeTask(t) === "helios");

  if (wguTask && heliosTask) {
    return `Complete your D278 study session before continuing ${heliosTask.title.toLowerCase()}.`;
  }
  if (wguTask) {
    return "Prioritize your D278 study session — consistent daily preparation is the path to passing the OA.";
  }
  if (heliosTask) {
    const inProg = heliosTask.status === "in_progress";
    return inProg
      ? `Continue ${heliosTask.title} and push your commits to GitHub before ending today's session.`
      : `Start ${heliosTask.title} — it is your next HELIOS milestone.`;
  }

  const top = ranked[0];
  return top
    ? `Your next highest-impact step is: ${top.title}.`
    : "Review your open tasks and identify what to focus on today.";
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function buildStats(ctx: HeliosIntelligenceContext): BriefStat[] {
  const today = ctx.currentTime.toISOString().split("T")[0];

  const activeGoals = ctx.goals.filter((g) => g.status === "active").length;
  const openTasks   = ctx.tasks.filter((t) => t.status !== "done").length;
  const overdue     = ctx.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today,
  ).length;
  const completedToday = ctx.tasks.filter((t) => {
    if (t.status !== "done" || !t.updatedAt) return false;
    return t.updatedAt.slice(0, 10) === today;
  }).length;
  const studyPending = ctx.tasks.some(
    (t) =>
      t.status !== "done" &&
      /d278|wgu|study session/i.test(t.title),
  );

  const stats: BriefStat[] = [];

  stats.push({
    label: activeGoals === 1 ? "active goal" : "active goals",
    value: String(activeGoals),
  });

  stats.push({
    label: openTasks === 1 ? "remaining task" : "remaining tasks",
    value: String(openTasks),
  });

  if (overdue > 0) {
    stats.push({
      label: overdue === 1 ? "overdue task" : "overdue tasks",
      value: String(overdue),
    });
  } else {
    stats.push({ label: "overdue deadlines", value: "No" });
  }

  if (studyPending) {
    stats.push({ label: "study session remaining", value: "1" });
  }

  if (completedToday > 0) {
    stats.push({
      label: completedToday === 1 ? "task completed today" : "tasks completed today",
      value: String(completedToday),
    });
  }

  return stats;
}

// ── Summary ───────────────────────────────────────────────────────────────────
// A natural-language sentence combining goal and task counts.

function buildSummary(ctx: HeliosIntelligenceContext): string {
  const activeGoals = ctx.goals.filter((g) => g.status === "active").length;
  const openTasks   = ctx.tasks.filter((t) => t.status !== "done").length;
  const today       = ctx.currentTime.toISOString().split("T")[0];
  const overdue     = ctx.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today,
  ).length;

  const parts: string[] = [];
  parts.push(
    `You have ${activeGoals} active ${activeGoals === 1 ? "goal" : "goals"} and ${openTasks} open ${openTasks === 1 ? "task" : "tasks"}.`,
  );

  if (overdue > 0) {
    parts.push(`${overdue} ${overdue === 1 ? "task is" : "tasks are"} overdue.`);
  } else {
    parts.push("There are no overdue deadlines.");
  }

  return parts.join(" ");
}

// ── Main export ───────────────────────────────────────────────────────────────
// Future AI integration point: wrap this function to call an LLM when a
// token is available, falling back to the deterministic output below.

export function generateDailyBrief(rawCtx: HeliosIntelligenceContext): DailyBrief {
  const ctx     = resolveContext(rawCtx);
  const ranked  = prioritizeTasks(ctx.tasks, ctx.goals, ctx.calendarEvents);

  return {
    title:          "Today's Brief",
    greeting:       getGreeting(ctx.currentTime, ctx.profile.name),
    focus:          buildFocusSentence(ranked),
    summary:        buildSummary(ctx),
    stats:          buildStats(ctx),
    recommendation: buildRecommendation(ranked),
    timestamp:      ctx.currentTime.toISOString(),
  };
}
