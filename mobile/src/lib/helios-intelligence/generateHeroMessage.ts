import { resolveContext } from "./context";
import type { HeliosIntelligenceContext, HeroMessage } from "./types";

// Returns the assistant message shown below the user's name on the Hero Card.
// Default is calm and confident. Only changes when something genuinely matters.
// Future AI integration point: LLM can override these rules with personalized output.

export function generateHeroMessage(rawCtx: HeliosIntelligenceContext): HeroMessage {
  const ctx   = resolveContext(rawCtx);
  const today = ctx.currentTime.toISOString().split("T")[0];

  const overdue = ctx.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today,
  ).length;

  const pendingApprovals = ctx.appStatus.pendingApprovals;

  const unreadImportant = ctx.notifications.filter(
    (n) => !n.isRead && (n.eventType === "approval_required" || n.eventType === "execution_blocked"),
  ).length;

  const studyDue = ctx.tasks.some(
    (t) => t.status !== "done" && t.dueDate === today && /d278|wgu|study session/i.test(t.title),
  );

  const heliosNextMilestone = (() => {
    const milestones = ["Calendar redesign", "Goals redesign", "Task Center polish"];
    for (const m of milestones) {
      const found = ctx.tasks.find(
        (t) => t.status !== "done" && t.title.toLowerCase().includes(m.toLowerCase()),
      );
      if (found) return m;
    }
    return null;
  })();

  // Priority order: errors → overdue → approvals → study nudge → milestone → default
  if (ctx.appStatus.apiError) {
    return {
      primary:   "Welcome back.",
      secondary: "HELIOS encountered an issue. Tap to review your connection.",
      isDefault: false,
    };
  }

  if (overdue > 0) {
    const label = overdue === 1 ? "one overdue item" : `${overdue} overdue items`;
    return {
      primary:   "Welcome back.",
      secondary: `You have ${label} that requires your attention.`,
      isDefault: false,
    };
  }

  if (pendingApprovals > 0 || unreadImportant > 0) {
    return {
      primary:   "Welcome back.",
      secondary: "HELIOS has something for you to review.",
      isDefault: false,
    };
  }

  if (studyDue) {
    return {
      primary:   "Welcome back.",
      secondary: "D278 should remain your top priority today.",
      isDefault: false,
    };
  }

  if (heliosNextMilestone) {
    return {
      primary:   "Welcome back.",
      secondary: `${heliosNextMilestone} is your next HELIOS milestone.`,
      isDefault: false,
    };
  }

  return {
    primary:   "Welcome back.",
    secondary: "Everything looks good today.",
    isDefault: true,
  };
}
