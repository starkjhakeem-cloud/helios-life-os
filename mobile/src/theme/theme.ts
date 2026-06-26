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

  // Premium material tokens
  glass: string;
  glassStrong: string;
  glassSubtle: string;
  heroGlass: string;
  elevatedCard: string;
  navGlass: string;
  floatingButton: string;
  primaryBorder: string;
  secondaryBorder: string;
  highlight: string;
  edgeHighlight: string;
  shadow: string;
  ambientShadow: string;
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

  glass:         "rgba(7, 17, 31, 0.91)",
  glassStrong:   "rgba(10, 20, 39, 0.94)",
  glassSubtle:   "rgba(5, 10, 24, 0.86)",
  heroGlass:     "rgba(10, 20, 39, 0.91)",
  elevatedCard:  "rgba(7, 17, 31, 0.91)",
  navGlass:      "rgba(6, 17, 33, 0.95)",
  floatingButton: "rgba(7, 17, 31, 0.90)",
  primaryBorder: "rgba(92, 120, 170, 0.22)",
  secondaryBorder: "rgba(38, 52, 82, 0.80)",
  highlight:     "rgba(255,255,255,0.08)",
  edgeHighlight: "rgba(255,255,255,0.08)",
  shadow:        "#000000",
  ambientShadow: "rgba(0,0,0,0.28)",
};

export const lightColors: ThemeColors = {
  background:    "#edf3ff",
  surface:       "rgba(255,255,255,0.90)",
  surfaceDark:   "rgba(232,238,250,0.66)",
  surfaceSecondary: "rgba(244,247,255,0.78)",
  card:          "rgba(255,255,255,0.88)",

  border:        "rgba(193,204,232,0.62)",
  borderDark:    "rgba(174,188,222,0.50)",

  textPrimary:   "#0a0f1e",
  textSecondary: "#465575",
  textMuted:     "#7a88a8",

  accent:        "#7c3aed",
  accentCyan:    "#0ea5c9",

  danger:        "#dc2626",
  success:       "#16a34a",
  warning:       "#d97706",
  info:          "#4f46e5",

  tabBar:        "rgba(255,255,255,0.66)",
  tabBarBorder:  "rgba(150, 163, 205, 0.28)",
  tabBarActive:  "#7c3aed",
  tabBarInactive: "#4f5f82",

  overlay:       "rgba(0,0,0,0.5)",

  glass:         "rgba(255,255,255,0.84)",
  glassStrong:   "rgba(255,255,255,0.94)",
  glassSubtle:   "rgba(248,250,255,0.68)",
  heroGlass:     "rgba(255,253,250,0.94)",
  elevatedCard:  "rgba(255,255,255,0.86)",
  navGlass:      "rgba(255,255,255,0.62)",
  floatingButton: "rgba(255,255,255,0.78)",
  primaryBorder: "rgba(255,255,255,0.88)",
  secondaryBorder: "rgba(170,184,220,0.44)",
  highlight:     "rgba(255,255,255,0.92)",
  edgeHighlight: "rgba(255,255,255,0.92)",
  shadow:        "#64748b",
  ambientShadow: "rgba(91,111,155,0.18)",
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
