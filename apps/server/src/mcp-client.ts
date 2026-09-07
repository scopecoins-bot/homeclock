import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Minimal MCP stdio client.
 *
 * The Somtoday MCP server communicates over newline-delimited JSON-RPC 2.0 on
 * stdio (the standard MCP stdio transport). Logs go to stderr and are never
 * mixed into the protocol stream. We implement only what we need:
 * initialize handshake + tools/call. No SDK dependency, no protocol drift risk.
 */

export interface McpOptions {
  cmd: string;
  args: string[];
  cwd: string;
  /** Env additions (PATH is inherited). */
  env?: Record<string, string>;
  /** Request timeout in ms. */
  timeoutMs?: number;
  logger?: Pick<Console, "log" | "warn" | "error">;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export type McpState = "stopped" | "starting" | "ready" | "error" | "crashed";

export class McpStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private buffer = "";
  private nextId = 1;
  private restarts = 0;
  private starting: Promise<void> | null = null;

  state: McpState = "stopped";
  lastError: string | null = null;
  serverInfo: { name?: string; version?: string } = {};

  constructor(private readonly options: McpOptions) {}

  private log(...args: unknown[]): void {
    this.options.logger?.log(`[mcp]`, ...args);
  }

  private warn(...args: unknown[]): void {
    this.options.logger?.warn(`[mcp]`, ...args);
  }

  /** Ensure the child process is running and initialized. Safe to call repeatedly. */
  async ensureStarted(): Promise<void> {
    if (this.state === "ready" && this.child && this.child.exitCode === null) return;
    if (this.starting) return this.starting;

    this.starting = (async () => {
      this.state = "starting";
      this.killChild();
      this.buffer = "";

      const child = spawn(this.options.cmd, this.options.args, {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcessWithoutNullStreams;

      this.child = child;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => this.onData(chunk));
      child.stderr.on("data", (chunk: string) => {
        // stderr is logging, never protocol; keep a bounded trace for diagnostics.
        const line = chunk.trim();
        if (line) this.lastStderr = line.slice(-500);
      });
      child.on("error", (err: Error) => {
        this.lastError = err.message;
        this.state = "error";
        this.rejectAllPending(new Error(`MCP spawn error: ${err.message}`));
      });
      child.on("exit", (code) => {
        if (this.state !== "stopped") {
          this.state = "crashed";
          this.lastError = `MCP exited with code ${code}`;
          this.restarts += 1;
          this.warn(`child exited (code=${code}, restarts=${this.restarts})`);
        }
        this.rejectAllPending(new Error(`MCP process exited (code ${code})`));
      });

      await this.call("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "homeclock-server", version: "1.0.0" },
      }).then((result) => {
        const info = result as { serverInfo?: { name?: string; version?: string } };
        this.serverInfo = info?.serverInfo ?? {};
      });
      this.notify("notifications/initialized");
      this.state = "ready";
      this.lastError = null;
    })().finally(() => {
      this.starting = null;
    });

    return this.starting;
  }

  private lastStderr = "";

  private rejectAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: JsonRpcResponse | JsonRpcNotification;
      try {
        msg = JSON.parse(line);
      } catch {
        this.warn(`unparseable line dropped (${line.length} chars)`);
        continue;
      }
      if ("id" in msg && msg.id !== undefined) {
        const entry = this.pending.get(String(msg.id));
        if (!entry) continue;
        clearTimeout(entry.timer);
        this.pending.delete(String(msg.id));
        if (msg.error) {
          entry.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
        } else {
          entry.resolve(msg.result);
        }
      }
      // Notifications are ignored (no subscriptions needed).
    }
  }

  private request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
    if (!this.child || this.child.exitCode !== null) {
      return Promise.reject(new Error("MCP process not running"));
    }
    const id = String(this.nextId++);
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, timeoutMs ?? this.options.timeoutMs ?? 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  private async call(method: string, params: unknown): Promise<unknown> {
    return this.request(method, params);
  }

  private notify(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.child?.stdin.write(JSON.stringify(notification) + "\n");
  }

  /** Call an MCP tool; returns the parsed JSON payload of the first text content block. */
  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.ensureStarted();
    const result = (await this.request("tools/call", { name, arguments: args }, 60_000)) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    if (result.isError) {
      throw new Error(`MCP tool ${name} returned isError`);
    }
    const textBlocks = (result.content ?? []).filter((c) => c.type === "text" && c.text);
    for (const block of textBlocks) {
      try {
        return JSON.parse(block.text!) as T;
      } catch {
        // try next block; tool wrappers sometimes prefix logs
      }
    }
    throw new Error(`MCP tool ${name} returned no parseable JSON payload`);
  }

  async stop(): Promise<void> {
    this.state = "stopped";
    this.killChild();
  }

  private killChild(): void {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    try {
      child.stdin.end();
      child.kill("SIGTERM");
      const t = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 3000);
      t.unref();
    } catch {
      // already dead
    }
  }

  get restartCount(): number {
    return this.restarts;
  }
}

/** Convenience wrapper for one-shot usage (CLI pairing, diagnostics). */
export async function withTempClient<T>(
  options: McpOptions,
  fn: (client: McpStdioClient) => Promise<T>,
): Promise<T> {
  const client = new McpStdioClient(options);
  try {
    await client.ensureStarted();
    return await fn(client);
  } finally {
    await client.stop();
  }
}

export function newRequestId(): string {
  return randomUUID();
}
