import React from "react";
import Svg, { Circle, Line, Rect } from "react-native-svg";
import { ProtectedHeliosIcon } from "./ProtectedHeliosIcons";

// HELIOS Icon System
//
// Protected icon assets live in assets/design/system/icons and must be rendered
// directly. Do not redraw or approximate protected assets with SVG paths or an
// icon library.
//
// IMPORTANT: react-native-svg does NOT propagate fill="none" from <Svg> to children.
// Every stroke-only element must have fill="none" set explicitly, or it renders
// filled black (the SVG spec default).

const SW = 2.25;

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

function CalendarIcon({ color, size = 28 }: P) {
  // Rounded rect frame + two binding tabs + header rule + 3×3 date dot grid (9 dots)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Body */}
      <Rect x={1.5} y={3.5} width={21} height={18.5} rx={2.5} stroke={color} strokeWidth={SW} fill="none" />
      {/* Header rule */}
      <Line x1={1.5} y1={9.5} x2={22.5} y2={9.5} stroke={color} strokeWidth={SW} />
      {/* Binding tabs */}
      <Line x1={8}  y1={1.5} x2={8}  y2={5.5} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      <Line x1={16} y1={1.5} x2={16} y2={5.5} stroke={color} strokeWidth={SW} strokeLinecap="round" />
      {/* Date dots — 3 cols × 3 rows, evenly spaced in body below header */}
      <Circle cx={6}  cy={12.6} r={1.2} fill={color} />
      <Circle cx={12} cy={12.6} r={1.2} fill={color} />
      <Circle cx={18} cy={12.6} r={1.2} fill={color} />
      <Circle cx={6}  cy={15.8} r={1.2} fill={color} />
      <Circle cx={12} cy={15.8} r={1.2} fill={color} />
      <Circle cx={18} cy={15.8} r={1.2} fill={color} />
      <Circle cx={6}  cy={19}   r={1.2} fill={color} />
      <Circle cx={12} cy={19}   r={1.2} fill={color} />
      <Circle cx={18} cy={19}   r={1.2} fill={color} />
    </Svg>
  );
}

function MoreIcon({ color, size = 28 }: P) {
  // Large outline circle + three filled dots (horizontal ellipsis)
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10}  stroke={color} strokeWidth={SW} fill="none" />
      <Circle cx={7}  cy={12} r={1.5} fill={color} />
      <Circle cx={12} cy={12} r={1.5} fill={color} />
      <Circle cx={17} cy={12} r={1.5} fill={color} />
    </Svg>
  );
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
