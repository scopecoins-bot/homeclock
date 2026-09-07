import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import websocket from "@fastify/websocket";
import type { WebSocket } from "ws";
import {
  alarmInputSchema,
  alarmPatchSchema,
  heartbeatSchema,
  pairRequestSchema,
  type Alarm,
  type DashboardResponse,
  type Lesson,
} from "@homeclock/shared";
import type { AlarmService } from "./alarms.js";
import { authenticate, exchangePairingCode, touchDevice } from "./auth.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { nextOccurrence, todayLocal, addDays, weekRange } from "./dates.js";
import type { EventBus } from "./events.js";
import type { SettingsService } from "./settings.js";
import type { SomtodayService } from "./somtoday.js";
import type { WeatherService } from "./weather.js";

export interface AppDeps {
  db: Db;
  config: Config;
  alarms: AlarmService;
  somtoday: SomtodayService;
  weather: WeatherService;
  settings: SettingsService;
  events: EventBus;
  startedAt: Date;
  /** Called after a successful settings patch (e.g. to re-refresh weather). */
  onSettingsChanged?: () => void;
}

interface AuthedRequest extends FastifyRequest {
  device: { id: string; name: string };
}

const PAIR_WINDOW_MS = 5 * 60_000;
const PAIR_MAX_ATTEMPTS = 10;

function validationReply(reply: FastifyReply, detail: string): FastifyReply {
  return reply.code(400).send({
    error: "Validation failed",
    code: "VALIDATION",
    detail,
  });
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: deps.config.logLevel,
      redact: {
        paths: ["req.headers.authorization", "req.query.token", "req.headers.cookie"],
        censor: "[REDACTED]",
      },
    },
    trustProxy: true,
  });

  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  // --- pairing rate limit (simple in-memory sliding window) ---
  const pairAttempts = new Map<string, number[]>();
  function pairAllowed(ip: string): boolean {
    const now = Date.now();
    const list = (pairAttempts.get(ip) ?? []).filter((t) => now - t < PAIR_WINDOW_MS);
    if (list.length >= PAIR_MAX_ATTEMPTS) {
      pairAttempts.set(ip, list);
      return false;
    }
    list.push(now);
    pairAttempts.set(ip, list);
    return true;
  }

  // --- auth guard: everything under /v1/* requires a device bearer token,
  // except the pairing exchange itself. /health stays open for monitoring. ---
  app.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0]!;
    if (url === "/health" || url === "/v1/pair/exchange") return;
    if (!url.startsWith("/v1/")) return;
    const device = authenticate(deps.db, request.headers.authorization);
    if (!device) {
      return reply.code(401).send({ error: "Unauthorized", code: "NO_AUTH" });
    }
    (request as AuthedRequest).device = device;
  });

  // --- health & status ---
  app.get("/health", async () => {
    let database: "ok" | "error" = "ok";
    try {
      deps.db.prepare("SELECT 1").get();
    } catch {
      database = "error";
    }
    return {
      ok: database === "ok",
      version: deps.config.version,
      database,
      somtoday: deps.somtoday.status().state,
      weather: deps.weather.status().state,
    };
  });

  app.get("/v1/status", async () => ({
    version: deps.config.version,
    serverTime: new Date().toISOString(),
    timezone: "Europe/Amsterdam",
    uptimeSeconds: Math.floor((Date.now() - deps.startedAt.getTime()) / 1000),
    database: "ok" as const,
    somtoday: deps.somtoday.status(),
    weather: deps.weather.status(),
  }));

  // --- dashboard ---
  app.get("/v1/dashboard", async (): Promise<DashboardResponse> => {
    const today = todayLocal();
    const tomorrow = addDays(today, 1);
    const { alarms } = deps.alarms.list();

    let nextAlarm: Alarm | null = null;
    let nextAt = Number.POSITIVE_INFINITY;
    for (const alarm of alarms) {
      if (!alarm.enabled) continue;
      const at = nextOccurrence(alarm.hour, alarm.minute, alarm.weekdays).getTime();
      if (at < nextAt) {
        nextAt = at;
        nextAlarm = alarm;
      }
    }

    const todayLessons = deps.somtoday.getLessons(today, today);
    const tomorrowLessons = deps.somtoday.getLessons(tomorrow, tomorrow);
    const dayEndIso =
      todayLessons.length > 0 ? todayLessons[todayLessons.length - 1]!.endIso : null;

    return {
      serverTime: new Date().toISOString(),
      nextAlarm,
      today: {
        date: today,
        lessons: todayLessons,
        firstLesson: todayLessons[0] ?? null,
        dayEndIso,
      },
      tomorrow: {
        date: tomorrow,
        firstLesson: tomorrowLessons[0] ?? null,
        lessonCount: tomorrowLessons.length,
      },
      weather: deps.weather.current(),
      somtoday: deps.somtoday.status(),
    };
  });

  // --- alarms CRUD ---
  app.get("/v1/alarms", async () => deps.alarms.list());

  app.post("/v1/alarms", async (request, reply) => {
    const parsed = alarmInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return validationReply(
        reply,
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const alarm = deps.alarms.create(parsed.data);
    return reply.code(201).send(alarm);
  });

  app.patch("/v1/alarms/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = alarmPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return validationReply(
        reply,
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    const alarm = deps.alarms.update(id, parsed.data);
    if (!alarm) {
      return reply.code(404).send({ error: "Alarm not found", code: "NOT_FOUND" });
    }
    return alarm;
  });

  app.delete("/v1/alarms/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deps.alarms.remove(id);
    if (!ok) {
      return reply.code(404).send({ error: "Alarm not found", code: "NOT_FOUND" });
    }
    return { ok: true };
  });

  // --- schedule ---
  app.get("/v1/schedule/today", async () => {
    const date = todayLocal();
    return { date, lessons: deps.somtoday.getLessons(date, date) };
  });

  app.get("/v1/schedule/tomorrow", async () => {
    const date = addDays(todayLocal(), 1);
    return { date, lessons: deps.somtoday.getLessons(date, date) };
  });

  app.get("/v1/schedule/week", async () => {
    const { from, to } = weekRange(todayLocal());
    const lessons: Lesson[] = deps.somtoday.getLessons(from, to);
    return { from, to, lessons };
  });

  // --- weather ---
  app.get("/v1/weather", async (_request, reply) => {
    const weather = deps.weather.current();
    if (!weather) {
      return reply.code(503).send({ error: "Weather not available yet", code: "NO_DATA" });
    }
    return weather;
  });

  // --- settings ---
  app.get("/v1/settings", async () => deps.settings.get());

  app.patch("/v1/settings", async (request, reply) => {
    try {
      const next = deps.settings.patch(request.body);
      deps.onSettingsChanged?.();
      return next;
    } catch (err) {
      return validationReply(reply, (err as Error).message);
    }
  });

  // --- pairing ---
  app.post("/v1/pair/exchange", async (request, reply) => {
    if (!pairAllowed(request.ip)) {
      return reply.code(429).send({ error: "Too many attempts", code: "RATE_LIMITED" });
    }
    const parsed = pairRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return validationReply(reply, "code (string) and deviceName (string) are required");
    }
    const result = exchangePairingCode(
      deps.db,
      parsed.data.code,
      parsed.data.deviceName,
      parsed.data.appVersion,
    );
    if (!result) {
      return reply
        .code(403)
        .send({ error: "Invalid or expired pairing code", code: "BAD_CODE" });
    }
    app.log.info({ deviceId: result.deviceId }, "device paired");
    return {
      deviceId: result.deviceId,
      token: result.token,
      serverVersion: deps.config.version,
    };
  });

  // --- heartbeat ---
  app.post("/v1/device/heartbeat", async (request) => {
    const device = (request as AuthedRequest).device;
    const parsed = heartbeatSchema.safeParse(request.body ?? {});
    const body = parsed.success ? parsed.data : {};
    touchDevice(deps.db, device.id, {
      appVersion: body.appVersion,
      syncRevision: body.syncRevision,
      alarmEngine: body.alarmEngine,
      alarmKitCount: body.alarmKitScheduledCount,
    });
    return {
      ok: true as const,
      serverTime: new Date().toISOString(),
      revision: deps.alarms.globalRevision(),
    };
  });

  // --- live events over WebSocket ---
  app.get("/v1/events", { websocket: true }, (connection, request) => {
    const url = new URL(request.url, "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const device = authenticate(
      deps.db,
      token ? `Bearer ${token}` : request.headers.authorization,
    );
    if (!device) {
      connection.close(4001, "unauthorized");
      return;
    }
    app.log.info({ deviceId: device.id }, "ws connected");

    connection.send(
      JSON.stringify({
        type: "hello",
        at: new Date().toISOString(),
        revision: deps.alarms.globalRevision(),
      }),
    );

    const unsubscribe = deps.events.subscribe((event) => {
      if (connection.readyState === connection.OPEN) connection.send(JSON.stringify(event));
    });
    const ping = setInterval(() => {
      if (connection.readyState === connection.OPEN) connection.ping();
    }, 30_000);
    connection.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
    connection.on("error", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  return app;
}
