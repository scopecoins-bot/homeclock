/**
 * HomeClock design system.
 * Four time-of-day themes; the clock is always the strongest element.
 * Restrained materials, generous spacing, minimal borders.
 */

export type ThemePeriod = "morning" | "day" | "evening" | "night";

export interface ThemeColors {
  /** Screen background (gradient start). */
  bgTop: string;
  bgBottom: string;
  /** Primary typography. */
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Card / material fill (usually white at low opacity or deep navy at night). */
  card: string;
  cardBorder: string;
  accent: string;
  /** Cancelled/destructive styling. */
  danger: string;
  statusOk: string;
  statusWarn: string;
  statusOffline: string;
  /** Big button colors (alarm active screen). */
  snoozeBg: string;
  snoozeText: string;
  stopBg: string;
  stopText: string;
  isDark: boolean;
}

const MORNING: ThemeColors = {
  bgTop: "#DCEBFA",
  bgBottom: "#F6F1E7",
  text: "#16233B",
  textSecondary: "#3E5375",
  textTertiary: "#7C8BA6",
  card: "rgba(255,255,255,0.55)",
  cardBorder: "rgba(255,255,255,0.65)",
  accent: "#3B74D8",
  danger: "#C0392B",
  statusOk: "#3E8E5A",
  statusWarn: "#B7791F",
  statusOffline: "#8A94A6",
  snoozeBg: "rgba(255,255,255,0.75)",
  snoozeText: "#16233B",
  stopBg: "#2E6BDF",
  stopText: "#FFFFFF",
  isDark: false,
};

const DAY: ThemeColors = {
  bgTop: "#EEF3F9",
  bgBottom: "#FFFFFF",
  text: "#1A2433",
  textSecondary: "#475A75",
  textTertiary: "#8794A8",
  card: "rgba(255,255,255,0.72)",
  cardBorder: "rgba(20,40,80,0.08)",
  accent: "#3B74D8",
  danger: "#C0392B",
  statusOk: "#3E8E5A",
  statusWarn: "#B7791F",
  statusOffline: "#8A94A6",
  snoozeBg: "rgba(20,40,80,0.06)",
  snoozeText: "#1A2433",
  stopBg: "#2E6BDF",
  stopText: "#FFFFFF",
  isDark: false,
};

const EVENING: ThemeColors = {
  bgTop: "#2A2F4A",
  bgBottom: "#191D31",
  text: "#F2EFE8",
  textSecondary: "#B9BED2",
  textTertiary: "#7D84A0",
  card: "rgba(255,255,255,0.06)",
  cardBorder: "rgba(255,255,255,0.10)",
  accent: "#8FB2F5",
  danger: "#E07B6A",
  statusOk: "#7BC496",
  statusWarn: "#E0B25F",
  statusOffline: "#8A90A8",
  snoozeBg: "rgba(255,255,255,0.10)",
  snoozeText: "#F2EFE8",
  stopBg: "#EDEFF7",
  stopText: "#1A2033",
  isDark: true,
};

const NIGHT: ThemeColors = {
  bgTop: "#070A14",
  bgBottom: "#0D1220",
  text: "#C9D2E4",
  textSecondary: "#6E7A96",
  textTertiary: "#46516B",
  card: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.06)",
  accent: "#5E7FBE",
  danger: "#9E5A50",
  statusOk: "#4E7A62",
  statusWarn: "#8C6F3F",
  statusOffline: "#5A6178",
  snoozeBg: "rgba(255,255,255,0.06)",
  snoozeText: "#C9D2E4",
  stopBg: "#B9C4DC",
  stopText: "#0B1020",
  isDark: true,
};

export function themeForHour(hour: number): ThemePeriod {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export const THEMES: Record<ThemePeriod, ThemeColors> = {
  morning: MORNING,
  day: DAY,
  evening: EVENING,
  night: NIGHT,
};

export const RADIUS = {
  card: 28,
  button: 999,
  small: 14,
} as const;

export const SPACE = {
  xs: 6,
  sm: 12,
  md: 20,
  lg: 32,
  xl: 48,
} as const;

export const TYPE = {
  /** Huge dashboard clock. */
  clock: 168,
  clockNight: 120,
  greeting: 30,
  cardTitle: 22,
  body: 17,
  small: 14,
  tiny: 12,
} as const;
