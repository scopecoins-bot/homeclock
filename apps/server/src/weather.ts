import type { Db } from "./db.js";
import type { Weather, WeatherSettings } from "@homeclock/shared";

interface FetchLike {
  (url: string, init?: { signal?: AbortSignal }): Promise<Response>;
}

const WMO_CODES: Record<number, string> = {
  0: "Helder",
  1: "Vrijwel helder",
  2: "Deels bewolkt",
  3: "Bewolkt",
  45: "Mist",
  48: "Mist",
  51: "Lichte motregen",
  53: "Motregen",
  55: "Fijne motregen",
  56: "Bevriezende motregen",
  57: "Bevriezende motregen",
  61: "Lichte regen",
  63: "Regen",
  65: "Zware regen",
  66: "Bevriezende regen",
  67: "Bevriezende regen",
  71: "Lichte sneeuw",
  73: "Sneeuw",
  75: "Zware sneeuw",
  77: "Motle sneeuw",
  80: "Lichte buien",
  81: "Buien",
  82: "Zware buien",
  85: "Sneeuwbuien",
  86: "Sneeuwbuien",
  95: "Onweer",
  96: "Onweer met hagel",
  99: "Onweer met hagel",
};

export function wmoDescription(code: number): string {
  return WMO_CODES[code] ?? "Onbekend";
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

export class WeatherService {
  state: "ok" | "error" | "unconfigured" = "unconfigured";
  lastRefresh: string | null = null;
  lastError: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly getSettings: () => WeatherSettings,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  status(): { state: "ok" | "error" | "unconfigured"; lastRefresh?: string } {
    return {
      state: this.state,
      ...(this.lastRefresh ? { lastRefresh: this.lastRefresh } : {}),
    };
  }

  current(): Weather | null {
    const row = this.db.prepare("SELECT payload FROM weather_cache WHERE id = 1").get() as
      | { payload: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload) as Weather;
    } catch {
      return null;
    }
  }

  async refresh(): Promise<void> {
    const settings = this.getSettings();
    if (!settings.locationName) {
      this.state = "unconfigured";
      return;
    }
    const url =
      "https://api.open-meteo.com/v1/forecast" +
      `?latitude=${settings.latitude}&longitude=${settings.longitude}` +
      "&current=temperature_2m,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&forecast_days=1&timezone=Europe%2FAmsterdam";
    try {
      const res = await this.fetchImpl(url);
      if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
      const data = (await res.json()) as OpenMeteoResponse;
      const temp = data.current?.temperature_2m;
      if (typeof temp !== "number") throw new Error("open-meteo response missing temperature");

      const weather: Weather = {
        locationName: settings.locationName,
        now: {
          temperature: Math.round(temp * 10) / 10,
          code: data.current?.weather_code ?? 0,
          condition: wmoDescription(data.current?.weather_code ?? 0),
        },
        high: Math.round((data.daily?.temperature_2m_max?.[0] ?? temp) * 10) / 10,
        low: Math.round((data.daily?.temperature_2m_min?.[0] ?? temp) * 10) / 10,
        precipitationChance: data.daily?.precipitation_probability_max?.[0],
        fetchedAt: new Date().toISOString(),
      };
      this.db
        .prepare(
          "INSERT INTO weather_cache (id, payload, fetched_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at",
        )
        .run(JSON.stringify(weather), weather.fetchedAt);
      this.state = "ok";
      this.lastRefresh = weather.fetchedAt;
      this.lastError = null;
    } catch (err) {
      // Retain last valid cache; just record the error.
      this.state = this.current() ? "ok" : "error";
      this.lastError = (err as Error).message;
    }
  }
}
