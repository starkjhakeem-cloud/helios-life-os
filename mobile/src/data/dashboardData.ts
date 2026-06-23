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
  { value: "0",  label: "Active Goals",    icon: "target" },
  { value: "0",  label: "Tasks Done",      icon: "checkmark.circle.fill" },
  { value: "0%", label: "Completion Rate", icon: "chart.line.uptrend.xyaxis" },
  { value: "0",  label: "Open Tasks",      icon: "list.bullet.clipboard" },
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
