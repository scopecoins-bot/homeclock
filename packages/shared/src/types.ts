/**
 * Shared HomeClock domain types.
 *
 * Weekday convention (used everywhere in HomeClock):
 *   0 = Sunday, 1 = Monday, ... 6 = Saturday  (matches JS Date#getDay).
 * The iOS AlarmKit layer maps this to DateComponents.weekday (1=Sunday..7=Saturday)
 * internally by adding 1.
 *
 * Timezone: all wall-clock alarm times are Europe/Amsterdam local time as seen
 * on the device; the server stores only hour/minute + weekdays, never instants.
 */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A single alarm configuration. Stable `id` across server and device. */
export interface Alarm {
  id: string;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  label: string;
  enabled: boolean;
  /** Empty array = one-shot alarm (fires once at the next occurrence of hour:minute). */
  weekdays: Weekday[];
  /** Identifier of a bundled alarm sound, e.g. "dawn" | "chime" | "radial". */
  sound: string;
  /** Snooze duration in minutes, 0 = snooze disabled. */
  snoozeMinutes: number;
  createdAt: string;
  updatedAt: string;
  /** Bumped on every change. Used for sync and last-write-wins conflict resolution. */
  revision: number;
}

export type AlarmInput = Pick<
  Alarm,
  "hour" | "minute" | "label" | "enabled" | "weekdays" | "sound" | "snoozeMinutes"
> & { id?: string };

/** Normalized school lesson (derived from the Somtoday MCP schedule). */
export interface Lesson {
  /** Somtoday afspraak id, stringified. Stable. */
  id: string;
  /** YYYY-MM-DD in Europe/Amsterdam. */
  date: string;
  startIso: string;
  endIso: string;
  /** Lesuur (period number), if the school uses them. */
  startPeriod?: number;
  endPeriod?: number;
  subject: string;
  subjectId?: number;
  room?: string;
  teacher?: string;
  /** Raw Somtoday status string, e.g. "ACTIEF". */
  statusRaw?: string;
  /** Somtoday reported this appointment as cancelled. */
  cancelled: boolean;
  /** Somtoday reported a change (moved/room change); true when status is not ACTIEF but not cancelled either. */
  changed: boolean;
  title?: string;
  notes?: string;
  fetchedAt: string;
}

export interface WeatherNow {
  temperature: number;
  /** WMO weather code. */
  code: number;
  /** Human readable condition in Dutch. */
  condition: string;
}

export interface Weather {
  locationName: string;
  now: WeatherNow;
  high: number;
  low: number;
  /** Max precipitation chance today in %, if available. */
  precipitationChance?: number;
  fetchedAt: string;
}

export interface WeatherSettings {
  /** Free-text place name, e.g. "Heerenveen". */
  locationName: string;
  latitude: number;
  longitude: number;
}

export interface AppSettings {
  timezone: string;
  weather: WeatherSettings;
  ui: {
    /** Night dim level 0-100 (%). */
    nightBrightness: number;
    /** Keep screen awake while app is foregrounded. */
    keepAwake: boolean;
  };
  sync: {
    /** Server-side schedule refresh interval during the day, minutes. */
    dayRefreshMinutes: number;
    /** Refresh interval at night, minutes. */
    nightRefreshMinutes: number;
  };
}

export type HomeClockEventName =
  | "alarms_changed"
  | "schedule_changed"
  | "weather_changed"
  | "settings_changed"
  | "hello";

export interface HomeClockEvent {
  type: HomeClockEventName;
  at: string;
  /** sync revision after the change (alarms_changed only). */
  revision?: number;
}

export interface ServerStatus {
  version: string;
  serverTime: string;
  timezone: string;
  uptimeSeconds: number;
  database: "ok";
  somtoday: {
    state: "ok" | "needs_auth" | "error" | "unavailable";
    detail?: string;
    lastRefresh?: string;
    lastSuccessfulRefresh?: string;
    lessonsCached: number;
  };
  weather: {
    state: "ok" | "error" | "unconfigured";
    lastRefresh?: string;
  };
}

export interface DashboardResponse {
  serverTime: string;
  nextAlarm: Alarm | null;
  today: {
    date: string;
    lessons: Lesson[];
    firstLesson: Lesson | null;
    /** End of the last lesson, ISO, if any. */
    dayEndIso: string | null;
  };
  tomorrow: {
    date: string;
    firstLesson: Lesson | null;
    lessonCount: number;
  };
  weather: Weather | null;
  somtoday: ServerStatus["somtoday"];
}

export interface PairRequest {
  code: string;
  deviceName: string;
  appVersion?: string;
}

export interface PairResponse {
  deviceId: string;
  token: string;
  serverVersion: string;
}

/** Body of POST /v1/device/heartbeat. */
export interface Heartbeat {
  appVersion?: string;
  /** Highest sync revision the device has already applied. */
  syncRevision?: number;
  /** AlarmKit state for diagnostics. */
  alarmEngine?: "alarmkit" | "notifications" | "unknown";
  alarmKitScheduledCount?: number;
}

export interface HeartbeatResponse {
  ok: true;
  serverTime: string;
  revision: number;
}

export type ApiErrorBody = {
  error: string;
  code?: string;
  detail?: string;
};
