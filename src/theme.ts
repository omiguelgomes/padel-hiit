// Design tokens — the single source of truth for the app's look.
// Bright, clean, modern, sporty (padel/tennis energy). No external deps.

export const colors = {
  // Brand blue (matches app.json splash #208AEF), refined for UI.
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  primarySoft: "#EFF4FF",

  // Energetic sport accent.
  accent: "#22C55E",

  // Surfaces & background.
  bg: "#F5F8FC",
  surface: "#FFFFFF",

  // Text.
  text: "#0F172A",
  textMuted: "#64748B",

  // Lines & states.
  border: "#E2E8F0",
  danger: "#DC2626",
  rest: "#0891B2", // cyan — "rest" cue in the player
  onPrimary: "#FFFFFF",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const font = {
  h1: { fontSize: 32, fontWeight: "800" as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: "700" as const, color: colors.text },
  h3: { fontSize: 17, fontWeight: "600" as const, color: colors.text },
  body: { fontSize: 16, fontWeight: "400" as const, color: colors.text },
  muted: { fontSize: 14, fontWeight: "400" as const, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: "600" as const, color: colors.textMuted },
} as const;

// Soft card elevation — works on iOS (shadow*), Android (elevation), and RN Web (box-shadow).
export const shadow = {
  shadowColor: "#0F172A",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 3,
} as const;

// Max content width on wide/web screens; content centers beyond this.
export const CONTENT_MAX_WIDTH = 520;
