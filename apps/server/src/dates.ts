/** Europe/Amsterdam date helpers without external dependencies. */

export const TIMEZONE = "Europe/Amsterdam";

const ymdFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const clockFormat = new Intl.DateTimeFormat("nl-NL", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Current date in Europe/Amsterdam as YYYY-MM-DD. */
export function todayLocal(now: Date = new Date()): string {
  return ymdFormat.format(now);
}

/** HH:mm in Europe/Amsterdam for an instant. */
export function clockLocal(instant: Date): string {
  return clockFormat.format(instant);
}

/** Shift a YYYY-MM-DD string by n days (calendar math in UTC; safe because input is a plain date). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** JS weekday (0=Sunday..6=Saturday) of a YYYY-MM-DD date. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday..Sunday range (ISO strings) containing the given date. */
export function weekRange(dateStr: string): { from: string; to: string } {
  const wd = weekdayOf(dateStr); // 0=Sun..6=Sat
  const backFromMonday = wd === 0 ? 6 : wd - 1;
  const from = addDays(dateStr, -backFromMonday);
  return { from, to: addDays(from, 6) };
}

/**
 * The next datetime (in Amsterdam local time) an alarm with the given
 * hour/minute + weekday set fires, relative to `now`.
 * Empty weekdays => next occurrence of hour:minute (possibly today).
 */
export function nextOccurrence(
  hour: number,
  minute: number,
  weekdays: number[],
  now: Date = new Date(),
): Date {
  // Walk forward minute-by-minute is wasteful; instead compute per-day.
  // Compare in Amsterdam local wall-clock using Intl parts.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string): number =>
    Number((parts.find((p) => p.type === type)?.value ?? "0").replace(/^24$/, "0"));
  const nowY = get("year");
  const nowM = get("month");
  const nowD = get("day");
  const nowH = get("hour");
  const nowMin = get("minute");

  const todayStr = `${nowY}-${String(nowM).padStart(2, "0")}-${String(nowD).padStart(2, "0")}`;
  for (let offset = 0; offset < 8; offset++) {
    const dateStr = addDays(todayStr, offset);
    if (weekdays.length > 0 && !weekdays.includes(weekdayOf(dateStr))) continue;
    if (offset === 0) {
      if (hour < nowH || (hour === nowH && minute <= nowMin)) continue;
    }
    // Construct the exact Amsterdam instant: Amsterdam is UTC+1 (CET) or UTC+2 (CEST).
    // Use the offset at noon of that date (stable across DST transitions within the day).
    const noonUtcGuess = Date.parse(`${dateStr}T12:00:00Z`);
    const offsetMinutes = tzOffsetMinutes(new Date(noonUtcGuess));
    const naive = Date.parse(`${dateStr}T${pad(hour)}:${pad(minute)}:00Z`);
    return new Date(naive - offsetMinutes * 60_000);
  }
  // Unreachable (7 weekdays max loop 8 days)
  return new Date(now.getTime() + 86_400_000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Offset of Europe/Amsterdam from UTC in minutes at a given instant. */
export function tzOffsetMinutes(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}
