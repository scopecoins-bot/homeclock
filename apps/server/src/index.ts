import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { EventBus } from "./events.js";
import { AlarmService } from "./alarms.js";
import { SettingsService } from "./settings.js";
import { SomtodayService } from "./somtoday.js";
import { WeatherService } from "./weather.js";
import { createMcpClient, createScheduler } from "./scheduler.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDb(config.databasePath);
  const events = new EventBus();
  const alarms = new AlarmService(db, events);
  const settings = new SettingsService(db);
  const mcp = createMcpClient(config);
  const somtoday = new SomtodayService(mcp, db);
  const weather = new WeatherService(db, () => settings.get().weather);

  const scheduler = createScheduler({
    config,
    somtoday,
    weather,
    settings,
    events,
    log: {
      info: (o, msg) => console.log(JSON.stringify({ level: "info", msg, ...o })),
      warn: (o, msg) => console.warn(JSON.stringify({ level: "warn", msg, ...o })),
    },
  });

  const startedAt = new Date();
  const app = await buildApp({
    db,
    config,
    alarms,
    somtoday,
    weather,
    settings,
    events,
    startedAt,
    onSettingsChanged: () => {
      // New weather location → refresh immediately (fire and forget).
      void weather.refresh().then(() => events.emit("weather_changed"));
    },
  });

  // Initial refresh in the background; server is usable immediately.
  void scheduler.runOnce().then(() => scheduler.start());

  await app.listen({ host: config.host, port: config.port });
  console.log(
    JSON.stringify({
      level: "info",
      msg: "homeclock server listening",
      host: config.host,
      port: config.port,
      version: config.version,
      database: config.databasePath,
    }),
  );

  const shutdown = async (signal: string): Promise<void> => {
    console.log(JSON.stringify({ level: "info", msg: "shutting down", signal }));
    await scheduler.stop();
    await app.close();
    await mcp.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "fatal", err: (err as Error).stack }));
  process.exit(1);
});
