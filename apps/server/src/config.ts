import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
/** apps/server/dist or apps/server/src — repo root is three levels up from dist. */
const repoRoot = path.resolve(moduleDir, "..", "..");

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  somtoday: {
    cmd: string;
    args: string[];
    cwd: string;
  };
  weatherEnabled: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databasePath = path.resolve(
    env.DATABASE_PATH ?? path.join(repoRoot, "data", "homeclock.db"),
  );
  const cwd = env.SOMTODAY_MCP_CWD ?? `${process.env.HOME ?? "/home/bossp"}/agent-stack/somtoday-mcp`;
  const argsRaw = env.SOMTODAY_MCP_ARGS ?? `${cwd}/dist/index.js`;

  const logLevelRaw = (env.LOG_LEVEL ?? "info").toLowerCase();
  const logLevel = (["debug", "info", "warn", "error"] as const).includes(
    logLevelRaw as Config["logLevel"],
  )
    ? (logLevelRaw as Config["logLevel"])
    : "info";

  return {
    host: env.HOST ?? "127.0.0.1",
    port: intEnv("PORT", 8788),
    databasePath,
    somtoday: {
      cmd: env.SOMTODAY_MCP_CMD ?? "node",
      args: argsRaw.split(" ").filter(Boolean),
      cwd,
    },
    weatherEnabled: (env.WEATHER_ENABLED ?? "1") !== "0",
    logLevel,
    version: "1.0.0",
  };
}

/** Instance id used in logs/status; stable per database. */
export function newId(): string {
  return randomUUID();
}
