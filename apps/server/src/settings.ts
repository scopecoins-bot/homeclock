import {
  DEFAULT_SETTINGS,
  settingsPatchSchema,
  type AppSettings,
} from "@homeclock/shared";
import type { Db } from "./db.js";

/**
 * Settings are server-authoritative (weather location etc.) and synced to the
 * iPad. Stored as JSON values keyed by top-level section.
 */
export class SettingsService {
  constructor(private readonly db: Db) {}

  get(): AppSettings {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[];
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        stored[row.key] = JSON.parse(row.value);
      } catch {
        // ignore malformed rows; fall back to defaults
      }
    }
    const weather = { ...DEFAULT_SETTINGS.weather, ...((stored.weather as object) ?? {}) };
    const ui = { ...DEFAULT_SETTINGS.ui, ...((stored.ui as object) ?? {}) };
    const sync = { ...DEFAULT_SETTINGS.sync, ...((stored.sync as object) ?? {}) };
    return {
      timezone: (stored.timezone as string) ?? DEFAULT_SETTINGS.timezone,
      weather,
      ui,
      sync,
    };
  }

  patch(patch: unknown): AppSettings {
    const parsed = settingsPatchSchema.parse(patch);
    const current = this.get();
    const next: AppSettings = {
      ...current,
      weather: parsed.weather ?? current.weather,
      ui: { ...current.ui, ...(parsed.ui ?? {}) },
      sync: { ...current.sync, ...(parsed.sync ?? {}) },
    };
    const upsert = this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    const tx = this.db.transaction(() => {
      upsert.run("weather", JSON.stringify(next.weather));
      upsert.run("ui", JSON.stringify(next.ui));
      upsert.run("sync", JSON.stringify(next.sync));
    });
    tx();
    return next;
  }
}
