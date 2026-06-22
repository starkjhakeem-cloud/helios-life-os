export type ThemeColors = {
  // Surfaces
  background: string;
  surface: string;
  surfaceDark: string;
  surfaceSecondary: string;
  card: string;

  // Borders
  border: string;
  borderDark: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Accent
  accent: string;
  accentCyan: string;

  // Semantic status
  danger: string;
  success: string;
  warning: string;
  info: string;

  // Tab bar
  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;

  // Overlay
  overlay: string;
};

export const darkColors: ThemeColors = {
  background:    "#020617",
  surface:       "#07111f",
  surfaceDark:   "#050a18",
  surfaceSecondary: "#050a18",
  card:          "rgba(10, 20, 39, 0.91)",

  border:        "#263452",
  borderDark:    "#1e2a44",

  textPrimary:   "#ffffff",
  textSecondary: "#c7d2fe",
  textMuted:     "#8490ab",

  accent:        "#a855f7",
  accentCyan:    "#22d3ee",

  danger:        "#ef4444",
  success:       "#22c55e",
  warning:       "#f59e0b",
  info:          "#6366f1",

  tabBar:        "rgba(6, 17, 33, 0.95)",
  tabBarBorder:  "rgba(92, 120, 170, 0.22)",
  tabBarActive:  "#8B5CF6",
  tabBarInactive: "#9AA8C5",

  overlay:       "rgba(0,0,0,0.6)",
};

export const lightColors: ThemeColors = {
  background:    "#f0f4ff",
  surface:       "#ffffff",
  surfaceDark:   "#e8edf8",
  surfaceSecondary: "#e8edf8",
  card:          "#ffffff",

  border:        "#d1daf0",
  borderDark:    "#bcc7e6",

  textPrimary:   "#0a0f1e",
  textSecondary: "#3d4a6b",
  textMuted:     "#6b7a9e",

  accent:        "#7c3aed",
  accentCyan:    "#0ea5c9",

  danger:        "#dc2626",
  success:       "#16a34a",
  warning:       "#d97706",
  info:          "#4f46e5",

  tabBar:        "rgba(240, 244, 255, 0.97)",
  tabBarBorder:  "rgba(145, 168, 197, 0.30)",
  tabBarActive:  "#7c3aed",
  tabBarInactive: "#6b7a9e",

  overlay:       "rgba(0,0,0,0.5)",
};

// Static fallback for non-component code (e.g. Zustand stores).
export const colors = darkColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
};

export const typography = {
  displayLarge: { fontSize: 40, fontWeight: "900" as const, letterSpacing: 0 },
  displaySmall: { fontSize: 28, fontWeight: "800" as const, letterSpacing: 0 },
  title:        { fontSize: 20, fontWeight: "700" as const },
  body:         { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  caption:      { fontSize: 13, fontWeight: "400" as const },
  label:        { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.5 },
};
