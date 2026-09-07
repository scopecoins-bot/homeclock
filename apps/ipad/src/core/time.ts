/** Time helpers used by the iPad app. Weekdays: 0=Sunday..6=Saturday. */

export const WEEKDAY_LABELS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
export const WEEKDAY_LONG = [
  "zondag",
  "maandag",
  "dinsdag",
  "woensdag",
  "donderdag",
  "vrijdag",
  "zaterdag",
];

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "07:00" from an ISO string. */
export function isoToClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Date part (YYYY-MM-DD) of an ISO string in *local* time. */
export function isoToDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayKey(now: Date = new Date()): string {
  return isoToDateKey(now.toISOString());
}

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay();
}

export function longDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return `${WEEKDAY_LONG[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
}

const MONTHS = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 11) return "Goedemorgen";
  if (hour >= 11 && hour < 18) return "Goedemiddag";
  if (hour >= 18 && hour < 22) return "Goedenavond";
  return "Goedenacht";
}

/** Weekday set label: "Werkdagen", "Weekend", "Elke dag" or "ma · di · vr". */
export function weekdayLabel(weekdays: number[]): string {
  if (weekdays.length === 0) return "Eenmalig";
  const sorted = [...weekdays].sort((a, b) => a - b);
  const workdays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];
  if (sorted.join() === workdays.join()) return "Werkdagen";
  if (sorted.join() === weekend.join()) return "Weekend";
  if (sorted.length === 7) return "Elke dag";
  return sorted.map((d) => WEEKDAY_LABELS[d]).join(" · ");
}

/**
 * Local next occurrence of an alarm. Mirrors the server logic but uses the
 * device calendar — the device is the alarm authority.
 */
export function nextOccurrence(
  hour: number,
  minute: number,
  weekdays: number[],
  now: Date = new Date(),
): Date {
  const candidate = new Date(now);
  candidate.setHours(hour, minute, 0, 0);
  if (weekdays.length === 0) {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(hour, minute, 0, 0);
    if (weekdays.includes(d.getDay()) && d > now) return d;
  }
  return candidate;
}

export function minutesUntil(iso: Date, now: Date = new Date()): number {
  return Math.max(0, Math.round((iso.getTime() - now.getTime()) / 60_000));
}

/** "over 7u20" / "over 45 min" */
export function humanUntil(minutes: number): string {
  if (minutes < 60) return `over ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `over ${h} uur` : `over ${h}u${String(m).padStart(2, "0")}`;
}

export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "nooit";
  const diff = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diff < 45) return "zojuist";
  if (diff < 3600) return `${Math.round(diff / 60)} min geleden`;
  if (diff < 86400) return `${Math.round(diff / 3600)} uur geleden`;
  return `${Math.round(diff / 86400)} dagen geleden`;
}
