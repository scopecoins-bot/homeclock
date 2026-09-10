import type {
  Alarm,
  AlarmInput,
  AppSettings,
  DashboardResponse,
  Lesson,
  PairResponse,
  ServerStatus,
  Weather,
} from "@homeclock/shared";

/**
 * Typed API client for the HomeClock backend.
 *
 * IMPORTANT: the endpoint is the tailnet HTTPS URL of bossp (e.g.
 * https://bossp.<tailnet>.ts.net:8788) — never "localhost", which on the iPad
 * refers to the iPad itself.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export class NetworkError extends Error {
  constructor(cause: Error) {
    super(`Server onbereikbaar: ${cause.message}`);
    this.cause = cause;
  }
}

const DEFAULT_TIMEOUT = 12_000;

async function request<T>(
  baseUrl: string,
  token: string | null,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  let res: Response;
  try {
    res = await fetch(baseUrl.replace(/\/$/, "") + path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new NetworkError(err as Error);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      code = body.code ?? code;
      message = body.error ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}

export interface HomeClockApi {
  status(): Promise<ServerStatus>;
  dashboard(): Promise<DashboardResponse>;
  alarms(): Promise<{ revision: number; alarms: Alarm[] }>;
  createAlarm(input: AlarmInput): Promise<Alarm>;
  updateAlarm(id: string, patch: Partial<AlarmInput>): Promise<Alarm>;
  deleteAlarm(id: string): Promise<void>;
  scheduleToday(): Promise<{ date: string; lessons: Lesson[] }>;
  scheduleTomorrow(): Promise<{ date: string; lessons: Lesson[] }>;
  scheduleWeek(): Promise<{ from: string; to: string; lessons: Lesson[] }>;
  weather(): Promise<Weather>;
  settings(): Promise<AppSettings>;
  patchSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  heartbeat(appVersion: string, syncRevision: number): Promise<{ revision: number }>;
  pair(code: string, deviceName: string, appVersion: string): Promise<PairResponse>;
}

export function createApi(baseUrl: string, token: string | null): HomeClockApi {
  const req = <T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) =>
    request<T>(baseUrl, token, method, path, body);

  return {
    status: () => req("GET", "/v1/status"),
    dashboard: () => req("GET", "/v1/dashboard"),
    alarms: () => req("GET", "/v1/alarms"),
    createAlarm: (input) => req("POST", "/v1/alarms", input),
    updateAlarm: (id, patch) => req("PATCH", `/v1/alarms/${id}`, patch),
    deleteAlarm: (id) => req("DELETE", `/v1/alarms/${id}`),
    scheduleToday: () => req("GET", "/v1/schedule/today"),
    scheduleTomorrow: () => req("GET", "/v1/schedule/tomorrow"),
    scheduleWeek: () => req("GET", "/v1/schedule/week"),
    weather: () => req("GET", "/v1/weather"),
    settings: () => req("GET", "/v1/settings"),
    patchSettings: (patch) => req("PATCH", "/v1/settings", patch),
    heartbeat: (appVersion, syncRevision) =>
      req("POST", "/v1/device/heartbeat", { appVersion, syncRevision }),
    pair: (code, deviceName, appVersion) =>
      req("POST", "/v1/pair/exchange", { code, deviceName, appVersion }),
  };
}

/**
 * Live events over WebSocket (RN has native WebSocket). Reconnects with
 * backoff; reports connection state so the UI can show a subtle status.
 */
export function connectEvents(
  baseUrl: string,
  token: string,
  onEvent: (event: { type: string; at: string; revision?: number }) => void,
  onStateChange: (connected: boolean) => void,
): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const url = `${baseUrl.replace(/\/$/, "").replace(/^http/, "ws")}/v1/events?token=${encodeURIComponent(token)}`;

  function connect(): void {
    if (closed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      attempts = 0;
      onStateChange(true);
    };
    ws.onmessage = (e) => {
      try {
        onEvent(JSON.parse(String(e.data)));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      onStateChange(false);
      scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        // already closing
      }
    };
  }

  function scheduleReconnect(): void {
    if (closed) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)) + Math.random() * 500;
    attempts += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    try {
      ws?.close();
    } catch {
      // fine
    }
    onStateChange(false);
  };
}

export { DEFAULT_ENDPOINT };
// TEMP nachttest: hotspot-tunnel via de PC (portproxy -> bossp HTTP serve).
// Morgen terug naar: https://bossp.tail7c0b14.ts.net:8788
const DEFAULT_ENDPOINT = "http://192.168.137.1:8789";
