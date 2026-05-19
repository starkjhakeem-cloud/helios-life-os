import type { SFSymbol } from "sf-symbols-typescript";

export type DashboardMetric = {
  value: string;
  label: string;
  icon: SFSymbol;
};

export type DashboardSection = {
  title: string;
  icon: SFSymbol;
  content: string;
};

export const dashboardMetrics: DashboardMetric[] = [
  { value: "82",     label: "Productivity", icon: "chart.line.uptrend.xyaxis" },
  { value: "5h 32m", label: "Focus Time",   icon: "timer" },
  { value: "12",     label: "Tasks Done",   icon: "checkmark.circle.fill" },
  { value: "68%",    label: "Energy",       icon: "bolt.fill" },
];

export const dashboardSections: DashboardSection[] = [
  {
    title: "AI Insight",
    icon: "brain",
    content:
      "Deep work sessions before noon correlate with higher task completion. HELIOS recommends protecting your morning hours for high-priority goals.",
  },
  {
    title: "Today's Focus",
    icon: "flag.fill",
    content:
      "Review your active goals, close out any overdue tasks, and use the AI Planner to map your next execution sprint.",
  },
];
