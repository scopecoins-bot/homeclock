import type { Alarm } from "./types.js";

/**
 * Alarm reconciliation: the heart of alarm reliability.
 *
 * Hard requirements:
 * - NEVER cancel-and-recreate every native alarm on sync.
 * - Diff current native state against desired state; only touch what changed.
 * - Server must not be needed for this to work.
 */

/** Snapshot of a natively scheduled alarm (from AlarmKit or the fallback). */
export interface NativeAlarmSnapshot {
  id: string;
  hour: number;
  minute: number;
  /** Sorted weekday list; empty = one-shot. */
  weekdays: number[];
  enabled: boolean;
  label: string;
}

export interface AlarmDiff {
  /** Native alarm ids to cancel (removed, disabled, or schedule truly changed). */
  toCancel: string[];
  /** Alarms to schedule natively (new, or changed after cancel). */
  toSchedule: Alarm[];
}

function sameSchedule(a: NativeAlarmSnapshot, b: Alarm): boolean {
  const wa = [...a.weekdays].sort((x, y) => x - y).join(",");
  const wb = [...b.weekdays].sort((x, y) => x - y).join(",");
  return (
    a.hour === b.hour &&
    a.minute === minuteOf(b) &&
    wa === wb &&
    a.enabled === b.enabled &&
    a.label === (b.label ?? "")
  );
}

function minuteOf(alarm: Alarm): number {
  return alarm.minute;
}

/**
 * Compare current native state with desired state.
 * Cancelled first, then scheduled, so updates are cancel+schedule of the same id.
 */
export function diffAlarms(current: NativeAlarmSnapshot[], desired: Alarm[]): AlarmDiff {
  const desiredById = new Map(desired.map((a) => [a.id, a]));

  const toCancel: string[] = [];
  const toSchedule: Alarm[] = [];

  for (const native of current) {
    const want = desiredById.get(native.id);
    if (!want) {
      toCancel.push(native.id);
      continue;
    }
    if (!sameSchedule(native, want)) {
      toCancel.push(native.id);
      if (want.enabled) toSchedule.push(want);
    }
  }
  for (const alarm of desired) {
    if (!desiredById.has(alarm.id)) continue;
    if (!current.some((n) => n.id === alarm.id) && alarm.enabled) {
      toSchedule.push(alarm);
    }
  }
  return { toCancel, toSchedule };
}

/**
 * Deterministic merge of device-local alarms with server state.
 * Single-user system, last-write-wins guarded by revisions:
 * an alarm present on both sides resolves to the higher per-alarm revision.
 */
export function mergeAlarmLists(
  local: Alarm[],
  server: Alarm[],
  localRevision: number,
  serverRevision: number,
): { alarms: Alarm[]; revision: number } {
  if (serverRevision >= localRevision) {
    // Server is at least as fresh: union with any local-only alarms.
    const serverIds = new Set(server.map((a) => a.id));
    const localOnly = local.filter((a) => !serverIds.has(a.id));
    return { alarms: mergeById([...server, ...localOnly]), revision: serverRevision };
  }
  // Local is newer: keep local (it will be pushed to the server).
  return { alarms: local, revision: localRevision };
}

function mergeById(alarms: Alarm[]): Alarm[] {
  const map = new Map<string, Alarm>();
  for (const alarm of alarms) {
    const existing = map.get(alarm.id);
    if (!existing || alarm.revision >= existing.revision) {
      map.set(alarm.id, alarm);
    }
  }
  return [...map.values()].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

/** Next enabled alarm (device-local computation, no server needed). */
export function nextEnabledAlarm(
  alarms: Alarm[],
  computeNext: (alarm: Alarm) => Date,
  now: Date = new Date(),
): { alarm: Alarm; at: Date } | null {
  let best: { alarm: Alarm; at: Date } | null = null;
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const at = computeNext(alarm);
    if (!best || at < best.at) best = { alarm, at };
  }
  if (best && best.at <= now) return null; // safety: never in the past
  return best;
}
