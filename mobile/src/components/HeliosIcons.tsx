import React from "react";
import { ProtectedHeliosIcon } from "./ProtectedHeliosIcons";

// HELIOS Icon System
//
// Protected icon assets live in assets/design/system/icons and must be rendered
// directly. Do not redraw or approximate protected assets with SVG paths or an
// icon library.

type P = { color: string; size?: number };

function HomeIcon({ size = 28 }: P) {
  return <ProtectedHeliosIcon name="home" size={size} />;
}

function AssistantIcon({ color, size = 28 }: P) {
  // Static fallback — tab bar bypasses this and uses HeliosEnergyCore directly.
  return <ProtectedHeliosIcon name="assistant" tintColor={color} size={size} />;
}

function GoalsIcon({ size = 28 }: P) {
  return <ProtectedHeliosIcon name="goals" size={size} />;
}

function TasksIcon({ size = 28 }: P) {
  return <ProtectedHeliosIcon name="tasks" size={size} />;
}

function CalendarIcon({ size = 28 }: P) {
  return <ProtectedHeliosIcon name="calendar" size={size} />;
}

function MoreIcon({ size = 28 }: P) {
  return <ProtectedHeliosIcon name="more" size={size} />;
}

export type HeliosIconName = "home" | "assistant" | "goals" | "tasks" | "calendar" | "more";

const ICONS: Record<HeliosIconName, React.FC<P>> = {
  home:      HomeIcon,
  assistant: AssistantIcon,
  goals:     GoalsIcon,
  tasks:     TasksIcon,
  calendar:  CalendarIcon,
  more:      MoreIcon,
};

export function HeliosIcon({ name, color, size = 28 }: P & { name: HeliosIconName }) {
  const Icon = ICONS[name];
  return <Icon color={color} size={size} />;
}
