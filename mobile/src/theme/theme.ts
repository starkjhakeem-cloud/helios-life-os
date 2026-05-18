export const colors = {
  background: "#050816",
  surface: "#10172a",
  surfaceDark: "#0b1020",
  border: "#263452",
  borderDark: "#1e2a44",
  textPrimary: "#ffffff",
  textSecondary: "#aab4cf",
  textMuted: "#8f9bb3",
  accent: "#7c3aed",
  accentCyan: "#22d3ee",
};

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
  displayLarge: { fontSize: 40, fontWeight: "900" as const, letterSpacing: -1 },
  displaySmall: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.5 },
  title:        { fontSize: 20, fontWeight: "700" as const },
  body:         { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  caption:      { fontSize: 13, fontWeight: "400" as const },
  label:        { fontSize: 11, fontWeight: "700" as const, letterSpacing: 1.5 },
};
