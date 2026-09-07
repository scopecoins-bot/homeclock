import type { Alarm, AlarmInput, Weekday } from "@homeclock/shared";
import { randomUUID } from "node:crypto";
import { bumpSyncRevision, type Db } from "./db.js";
import type { EventBus } from "./events.js";

interface AlarmRow {
  id: string;
  hour: number;
  minute: number;
  label: string;
  enabled: number;
  weekdays: string;
  sound: string;
  snooze_minutes: number;
  created_at: string;
  updated_at: string;
  revision: number;
}

function rowToAlarm(row: AlarmRow): Alarm {
  return {
    id: row.id,
    hour: row.hour,
    minute: row.minute,
    label: row.label,
    enabled: row.enabled === 1,
    weekdays: JSON.parse(row.weekdays) as Weekday[],
    sound: row.sound,
    snoozeMinutes: row.snooze_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
  };
}

export interface AlarmList {
  revision: number;
  alarms: Alarm[];
}

/**
 * Server-side alarm store. The server stores synchronized configuration only;
 * the runtime trigger lives on the iPad (AlarmKit). Conflicts are resolved
 * last-write-wins, guarded by per-alarm `revision` + global `revision`.
 */
export class AlarmService {
  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
  ) {}

  list(): AlarmList {
    const rows = this.db.prepare("SELECT * FROM alarms ORDER BY hour, minute").all() as AlarmRow[];
    return { revision: this.globalRevision(), alarms: rows.map(rowToAlarm) };
  }

  globalRevision(): number {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = 'sync_revision'").get() as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : 0;
  }

  get(id: string): Alarm | null {
    const row = this.db.prepare("SELECT * FROM alarms WHERE id = ?").get(id) as
      | AlarmRow
      | undefined;
    return row ? rowToAlarm(row) : null;
  }

  create(input: AlarmInput): Alarm {
    const now = new Date().toISOString();
    const id = input.id ?? randomUUID();
    const revision = this.bumpGlobal();
    this.db
      .prepare(
        `INSERT INTO alarms (id, hour, minute, label, enabled, weekdays, sound, snooze_minutes, created_at, updated_at, revision)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.hour,
        input.minute,
        input.label,
        input.enabled ? 1 : 0,
        JSON.stringify(input.weekdays),
        input.sound,
        input.snoozeMinutes,
        now,
        now,
        revision,
      );
    const alarm = this.get(id)!;
    this.events.emit("alarms_changed", { revision });
    return alarm;
  }

  update(id: string, patch: Partial<AlarmInput>): Alarm | null {
    const existing = this.get(id);
    if (!existing) return null;
    const next: Alarm = {
      ...existing,
      hour: patch.hour ?? existing.hour,
      minute: patch.minute ?? existing.minute,
      label: patch.label ?? existing.label,
      enabled: patch.enabled ?? existing.enabled,
      weekdays: patch.weekdays ?? existing.weekdays,
      sound: patch.sound ?? existing.sound,
      snoozeMinutes: patch.snoozeMinutes ?? existing.snoozeMinutes,
    };
    const revision = this.bumpGlobal();
    this.db
      .prepare(
        `UPDATE alarms SET hour = ?, minute = ?, label = ?, enabled = ?, weekdays = ?, sound = ?, snooze_minutes = ?, updated_at = ?, revision = ? WHERE id = ?`,
      )
      .run(
        next.hour,
        next.minute,
        next.label,
        next.enabled ? 1 : 0,
        JSON.stringify(next.weekdays),
        next.sound,
        next.snoozeMinutes,
        new Date().toISOString(),
        revision,
        id,
      );
    this.events.emit("alarms_changed", { revision });
    return this.get(id);
  }

  remove(id: string): boolean {
    const result = this.db.prepare("DELETE FROM alarms WHERE id = ?").run(id);
    if (result.changes > 0) {
      const revision = this.bumpGlobal();
      this.events.emit("alarms_changed", { revision });
      return true;
    }
    return false;
  }

  private bumpGlobal(): number {
    return bumpSyncRevision(this.db);
  }
}
