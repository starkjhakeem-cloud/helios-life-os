const DEFAULT_LOCATION = "New York";

export function getTimeBasedGreeting(date: Date): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) return "Good morning,";
  if (hour >= 12 && hour < 17) return "Good afternoon,";
  if (hour >= 17 && hour < 22) return "Good evening,";
  return "Good night,";
}

export function formatHeroDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatHeroTime(date: Date, timeFormat: "12h" | "24h" = "12h"): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat === "12h",
  });
}

export function formatHeroTimeLocation(
  date: Date,
  location?: string | null,
  timeFormat: "12h" | "24h" = "12h",
): string {
  const time = formatHeroTime(date, timeFormat);
  const locationLabel = location?.trim() || DEFAULT_LOCATION;

  return `${time} • ${locationLabel}`;
}

export function formatActiveGoalsSubtitle(activeGoals: number): string {
  if (activeGoals === 0) return "No active goals";
  return "Currently active";
}

export function isActiveGoalStatus(status: string | null | undefined): boolean {
  const normalized = status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "active" || normalized === "in_progress";
}

export function formatSafeMetricNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  return String(Math.floor(value));
}

export function formatSafeMetricPercent(value: number): string {
  return `${formatSafeMetricNumber(value)}%`;
}

export function formatSafeDashboardMetricValue(label: string, value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : value;

  if (label === "Completion Rate") {
    const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    return formatSafeMetricPercent(parsed);
  }

  if (label === "Active Goals" || label === "Tasks Done" || label === "Open Tasks") {
    const parsed = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
    return formatSafeMetricNumber(parsed);
  }

  return String(raw || "0");
}

export { DEFAULT_LOCATION };
