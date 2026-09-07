import { McpStdioClient } from "./mcp-client.js";
import { SomtodayService } from "./somtoday.js";
import type { WeatherService } from "./weather.js";
import type { SettingsService } from "./settings.js";
import type { EventBus } from "./events.js";
import type { Config } from "./config.js";

export interface Scheduler {
  start: () => void;
  stop: () => Promise<void>;
  /** Force an immediate schedule+weather refresh (used on startup and tests). */
  runOnce: () => Promise<void>;
}

/**
 * Background refresh loops.
 *
 * - Somtoday schedule: rolling window refresh; ~10 min during the day,
 *   ~60 min at night (configurable in settings). On repeated failures the
 *   interval backs off, and cached lessons stay available.
 * - Somtoday auth: when unauthenticated, re-check every 30 min so the system
 *   recovers automatically after `npm run auth` completes on bossp.
 * - Weather: every 30 min (open-meteo is cheap, cache keeps serving on errors).
 */
export function createScheduler(opts: {
  config: Config;
  somtoday: SomtodayService;
  weather: WeatherService;
  settings: SettingsService;
  events: EventBus;
  log: { info: (o: object, msg: string) => void; warn: (o: object, msg: string) => void };
}): Scheduler {
  const { somtoday, weather, settings, events } = opts;
  const timers: NodeJS.Timeout[] = [];
  let stopped = false;
  let consecutiveScheduleFailures = 0;

  function isDaytime(now: Date = new Date()): boolean {
    // Local Amsterdam hour via Intl (server may run UTC).
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Amsterdam",
        hour: "2-digit",
        hour12: false,
      })
        .format(now)
        .replace(/^24/, "0"),
    );
    return hour >= 6 && hour < 23;
  }

  function scheduleDelayMs(): number {
    const s = settings.get().sync;
    const base = (isDaytime() ? s.dayRefreshMinutes : s.nightRefreshMinutes) * 60_000;
    const backoff = consecutiveScheduleFailures > 0
      ? Math.min(consecutiveScheduleFailures, 6) * 60_000
      : 0;
    return base + backoff + Math.floor(Math.random() * 30_000);
  }

  async function refreshSchedule(): Promise<void> {
    try {
      if (somtoday.state !== "ok") {
        await somtoday.checkAuth();
      }
      if (somtoday.state !== "ok") {
        // Not authenticated or unreachable — no point fetching.
        return;
      }
      const count = await somtoday.refreshWindow();
      consecutiveScheduleFailures = 0;
      opts.log.info({ lessons: count }, "schedule refreshed");
      events.emit("schedule_changed");
    } catch (err) {
      consecutiveScheduleFailures += 1;
      somtoday.state = "error";
      somtoday.detail = (err as Error).message;
      opts.log.warn(
        { err: (err as Error).message, failures: consecutiveScheduleFailures },
        "schedule refresh failed",
      );
    }
  }

  async function refreshWeather(): Promise<void> {
    if (!opts.config.weatherEnabled) return;
    await weather.refresh();
    if (weather.state === "ok") events.emit("weather_changed");
  }

  function scheduleNext(): void {
    if (stopped) return;
    const t = setTimeout(async () => {
      if (stopped) return;
      await Promise.allSettled([refreshSchedule(), refreshWeather()]);
      scheduleNext();
    }, scheduleDelayMs());
    timers.push(t);
  }

  return {
    start() {
      stopped = false;
      scheduleNext();
    },
    async stop() {
      stopped = true;
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    },
    async runOnce() {
      await Promise.allSettled([refreshSchedule(), refreshWeather()]);
    },
  };
}

export function createMcpClient(config: Config): McpStdioClient {
  return new McpStdioClient({
    cmd: config.somtoday.cmd,
    args: config.somtoday.args,
    cwd: config.somtoday.cwd,
    timeoutMs: 45_000,
    logger: {
      log: (...a) => console.log(...a),
      warn: (...a) => console.warn(...a),
      error: (...a) => console.error(...a),
    },
  });
}
