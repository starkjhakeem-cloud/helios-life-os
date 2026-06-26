import type { TaskSuggestion } from "../services/taskEngineService";

export type SuggestionSourceFilter = "all" | "gmail" | "calendar" | "goals" | "assistant";

function priorityRank(priority: string): number {
  return priority === "critical" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function suggestionMetadataValue(suggestion: TaskSuggestion, keys: string[]): string | null {
  const metadata = suggestion.source_metadata ?? {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function normalizeSuggestionText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sourceLabel(sourceType: string): string {
  const source = sourceType.toLowerCase();
  if (source.includes("gmail") || source.includes("email")) return "Gmail";
  if (source.includes("calendar")) return "Calendar";
  if (source.includes("goal")) return "Goals";
  if (source.includes("assistant") || source.includes("ai")) return "Assistant";
  return sourceType ? sourceType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "HELIOS";
}

export function sourceFilterForSuggestion(suggestion: TaskSuggestion): SuggestionSourceFilter {
  const label = sourceLabel(suggestion.source_type).toLowerCase();
  if (label === "gmail") return "gmail";
  if (label === "calendar") return "calendar";
  if (label === "goals") return "goals";
  if (label === "assistant") return "assistant";
  return "assistant";
}

export function isPromotionalSuggestion(suggestion: TaskSuggestion): boolean {
  const text = `${suggestion.title} ${suggestion.description ?? ""} ${suggestion.reason ?? ""}`.toLowerCase();
  const metadata = suggestion.source_metadata ?? {};
  const labelValues = ["category", "label", "label_name", "mailbox", "classification"].map(k => metadata[k]);
  return (
    labelValues.some(v => typeof v === "string" && /promo|marketing|advertisement|newsletter/.test(v.toLowerCase())) ||
    /deposit|coupon|sale|discount|deal|offer|unsubscribe|learn more|limited time/.test(text)
  );
}

export function suggestionReason(suggestion: TaskSuggestion): string {
  const source = sourceLabel(suggestion.source_type);
  if (isPromotionalSuggestion(suggestion)) return `${source} • Low priority`;
  if (suggestion.reason) {
    const compact = suggestion.reason
      .replace(/^important gmail item that may require action\.?$/i, "May need review")
      .replace(/^suggested task based on/i, "Suggested from")
      .trim();
    if (compact.length <= 42) return `${source} • ${compact}`;
  }
  if (source === "Gmail") return "Gmail • May need review";
  if (source === "Calendar") return "Calendar • Prep suggested";
  if (source === "Goals") return "Goals • Supports progress";
  return `${source} • Suggested action`;
}

export function suggestionDedupeKey(suggestion: TaskSuggestion): string {
  const metadataKey = suggestionMetadataValue(suggestion, [
    "source_id",
    "external_id",
    "thread_id",
    "message_id",
    "gmail_thread_id",
    "gmail_message_id",
    "event_id",
  ]);
  if (metadataKey) return `${sourceLabel(suggestion.source_type).toLowerCase()}:${metadataKey}`;
  if (suggestion.source_id) return `${sourceLabel(suggestion.source_type).toLowerCase()}:${suggestion.source_id}`;
  return `${sourceLabel(suggestion.source_type).toLowerCase()}:${normalizeSuggestionText(suggestion.title)}`;
}

export function suggestionScore(suggestion: TaskSuggestion): number {
  let score = priorityRank(suggestion.priority) * 100;
  const source = sourceLabel(suggestion.source_type);
  const text = `${suggestion.title} ${suggestion.description ?? ""} ${suggestion.reason ?? ""}`.toLowerCase();
  if (suggestion.priority === "critical" || suggestion.priority === "high") score += 80;
  if (source === "Gmail" && /reply|respond|review|invoice|follow up|follow-up|deadline|action/.test(text)) score += 55;
  if (source === "Calendar") score += 42;
  if (source === "Goals") score += 32;
  if (source === "Assistant") score += 20;
  if (isPromotionalSuggestion(suggestion)) score -= 120;
  score += Math.round((suggestion.confidence ?? 0) * 20);
  return score;
}

export function prepareSuggestions(suggestions: TaskSuggestion[]): TaskSuggestion[] {
  const byKey = new Map<string, TaskSuggestion>();
  suggestions.forEach((suggestion) => {
    const key = suggestionDedupeKey(suggestion);
    const current = byKey.get(key);
    if (!current || suggestionScore(suggestion) > suggestionScore(current)) {
      byKey.set(key, suggestion);
    }
  });
  return [...byKey.values()].sort((a, b) => suggestionScore(b) - suggestionScore(a));
}

export function sourceBreakdown(suggestions: TaskSuggestion[]): string {
  const labels = Array.from(new Set(suggestions.map(s => sourceLabel(s.source_type))));
  if (labels.length === 0) return "HELIOS";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
