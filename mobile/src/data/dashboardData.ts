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
      "You are most productive between 9 AM and 12 PM. HELIOS recommends scheduling deep work during that window.",
  },
  {
    title: "Today's Mission",
    icon: "flag.fill",
    content:
      "Build the first mobile dashboard, commit your progress, and prepare the backend foundation.",
  },
];
