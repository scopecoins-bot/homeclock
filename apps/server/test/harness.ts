import { openDb, type Db } from "../src/db.js";
import { EventBus } from "../src/events.js";
import { AlarmService } from "../src/alarms.js";
import { SettingsService } from "../src/settings.js";
import { SomtodayService } from "../src/somtoday.js";
import { WeatherService } from "../src/weather.js";
import { buildApp } from "../src/app.js";
import type { McpStdioClient } from "../src/mcp-client.js";
import type { Config } from "../src/config.js";
import { exchangePairingCode, createPairingCode } from "../src/auth.js";
import type { FastifyInstance } from "fastify";

export interface TestHarness {
  app: FastifyInstance;
  db: Db;
  token: string;
  alarms: AlarmService;
  somtoday: SomtodayService;
  weather: WeatherService;
  settings: SettingsService;
  events: EventBus;
}

export function testConfig(): Config {
  return {
    host: "127.0.0.1",
    port: 0,
    databasePath: ":memory:",
    somtoday: { cmd: "true", args: [], cwd: "." },
    weatherEnabled: true,
    logLevel: "error",
    version: "test",
  };
}

export function fakeMcpClient(
  impl: (tool: string, args: Record<string, unknown>) => Promise<unknown> = async () => {
    throw new Error("no tools in fake client");
  },
): McpStdioClient {
  return {
    callTool: impl,
  } as unknown as McpStdioClient;
}

export async function makeHarness(
  mcpImpl?: (tool: string, args: Record<string, unknown>) => Promise<unknown>,
  fetchImpl?: (url: string) => Promise<Response>,
): Promise<TestHarness> {
  const db = openDb(":memory:");
  const events = new EventBus();
  const alarms = new AlarmService(db, events);
  const settings = new SettingsService(db);
  const somtoday = new SomtodayService(fakeMcpClient(mcpImpl), db);
  const weather = new WeatherService(
    db,
    () => settings.get().weather,
    (fetchImpl ?? (async () => {
      throw new Error("no network in tests");
    })) as never,
  );

  const app = await buildApp({
    db,
    config: testConfig(),
    alarms,
    somtoday,
    weather,
    settings,
    events,
    startedAt: new Date(),
  });
  await app.ready();

  // Seed one paired device via the real pairing flow.
  const code = createPairingCode(db, "Test iPad");
  const pair = exchangePairingCode(db, code, "Test iPad", "1.0.0");
  if (!pair) throw new Error("failed to seed test device");

  return { app, db, token: pair.token, alarms, somtoday, weather, settings, events };
}

/** Authorization header for the seeded device. */
export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}
