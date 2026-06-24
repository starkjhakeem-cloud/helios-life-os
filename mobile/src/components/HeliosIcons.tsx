import React from "react";
import { Image, type ImageSourcePropType } from "react-native";
import Svg, { Circle, Line, Rect } from "react-native-svg";

// HELIOS Icon System
//
// Protected icon assets live in assets/design/system/icons and must be rendered
// directly. Do not redraw or approximate protected assets with SVG paths or an
// icon library.
//
// IMPORTANT: react-native-svg does NOT propagate fill="none" from <Svg> to children.
// Every stroke-only element must have fill="none" set explicitly, or it renders
// filled black (the SVG spec default).

const PROTECTED_ICON_ASSETS = {
  home: require("../../assets/design/system/icons/home.png"),
  assistant: require("../../assets/design/branding/helios-energy-core-transparent.png"),
} as const satisfies Record<string, ImageSourcePropType>;

const SW = 2.25;

type P = { color: string; size?: number };

function ProtectedAssetIcon({
  source,
  color,
  preserveColor = false,
  size = 28,
}: P & { preserveColor?: boolean; source: ImageSourcePropType }) {
  return (
    <Image
      source={source}
      style={{ width: size, height: size, tintColor: preserveColor ? undefined : color }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

function HomeIcon({ color, size = 28 }: P) {
  return (
    <ProtectedAssetIcon
      source={PROTECTED_ICON_ASSETS.home}
      color={color}
      preserveColor
      size={size}
    />
  );
}

function AssistantIcon({ color, size = 28 }: P) {
  // Static fallback — tab bar bypasses this and uses HeliosEnergyCore directly.
  return (
    <ProtectedAssetIcon
      source={PROTECTED_ICON_ASSETS.assistant}
      color={color}
      size={size}
    />
  );
}

function GoalsIcon({ color, size = 28 }: P) {
  // Three concentric rings + filled center dot
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={SW} fill="none" />
      <Circle cx={12} cy={12} r={5.5} stroke={color} strokeWidth={SW} fill="none" />
      <Circle cx={12} cy={12} r={1.5} fill={color} />
    </Svg>
  );
}

function TasksIcon({ color, size = 28 }: P) {
  // Three identical checklist rows: empty circle bullet + horizontal line.
  // All rows are the same — no checkmark state at nav-icon scale.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Row 1 */}
      <Circle cx={4} cy={6.5}  r={2.5} stroke={color} strokeWidth={SW} fill="none" />
      <Line x1={10} y1={6.5}  x2={21} y2={6.5}  stroke={color} strokeWidth={SW} strokeLinecap="round" />
      {/* Row 2 */}
      <Circle cx={4} cy={13}   r={2.5} stroke={color} strokeWidth={SW} fill="none" />
      <Line x1={10} y1={13}   x2={21} y2={13}   stroke={color} strokeWidth={SW} strokeLinecap="round" />
      {/* Row 3 */}
      <Circle cx={4} cy={19.5} r={2.5} stroke={color} strokeWidth={SW} fill="none" />
      <Line x1={10} y1={19.5} x2={21} y2={19.5} stroke={color} strokeWidth={SW} strokeLinecap="round" />
    </Svg>
  );
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
