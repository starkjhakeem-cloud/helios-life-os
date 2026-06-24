import { resolveContext } from "./context";
import type { AssistantStatusResult, HeliosIntelligenceContext } from "./types";

// Returns a structured status label that the UI can map to colors and icons.
// Future AI integration point: status can be enriched with LLM-generated
// context-aware labels (e.g. "Reviewing your Gravewood draft").

export function generateAssistantStatus(
  rawCtx: HeliosIntelligenceContext,
): AssistantStatusResult {
  const ctx   = resolveContext(rawCtx);
  const today = ctx.currentTime.toISOString().split("T")[0];

  const { apiError, aiOffline, isSyncing, pendingApprovals } = ctx.appStatus;

  if (apiError) {
    return { label: "Needs your attention", tone: "needs_attention", colorIntent: "danger" };
  }

  if (aiOffline) {
    return { label: "Syncing information", tone: "syncing", colorIntent: "warning" };
  }

  const overdue = ctx.tasks.filter(
    (t) => t.status !== "done" && t.dueDate && t.dueDate.slice(0, 10) < today,
  ).length;

  const highPriority = ctx.tasks.filter(
    (t) => t.status !== "done" && (t.priority === "critical" || t.priority === "high"),
  ).length;

  if (pendingApprovals > 0 || overdue > 0 || highPriority > 0) {
    return { label: "Needs your attention", tone: "needs_attention", colorIntent: "warning" };
  }

  if (isSyncing) {
    return { label: "Working in the background", tone: "syncing", colorIntent: "cyan" };
  }

  const inProgress = ctx.tasks.filter((t) => t.status === "in_progress").length;
  if (inProgress > 0) {
    return { label: "Focused", tone: "focused", colorIntent: "purple" };
  }

  const openTasks = ctx.tasks.filter((t) => t.status !== "done").length;
  if (openTasks === 0) {
    return { label: "All clear", tone: "ready", colorIntent: "cyan" };
  }

  return { label: "Ready to help", tone: "ready", colorIntent: "cyan" };
}
