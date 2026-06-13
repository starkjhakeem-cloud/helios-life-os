export type ThemeColors = {
  background: string;
  surface: string;
  surfaceDark: string;
  border: string;
  borderDark: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentCyan: string;
};

export const darkColors: ThemeColors = {
  background:    "#020617",
  surface:       "#07111f",
  surfaceDark:   "#050a18",
  border:        "#263452",
  borderDark:    "#1e2a44",
  textPrimary:   "#ffffff",
  textSecondary: "#c7d2fe",
  textMuted:     "#8490ab",
  accent:        "#a855f7",
  accentCyan:    "#22d3ee",
};

export const lightColors: ThemeColors = {
  background:    "#f0f4ff",
  surface:       "#ffffff",
  surfaceDark:   "#e8edf8",
  border:        "#d1daf0",
  borderDark:    "#bcc7e6",
  textPrimary:   "#0a0f1e",
  textSecondary: "#3d4a6b",
  textMuted:     "#6b7a9e",
  accent:        "#7c3aed",
  accentCyan:    "#0ea5c9",
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
