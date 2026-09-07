import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffAlarms,
  mergeAlarmLists,
  nextEnabledAlarm,
  type Alarm,
  type NativeAlarmSnapshot,
} from "@homeclock/shared";

function alarm(overrides: Partial<Alarm> & { id: string }): Alarm {
  return {
    hour: 7,
    minute: 0,
    label: "",
    enabled: true,
    weekdays: [1, 2, 3, 4, 5],
    sound: "dawn",
    snoozeMinutes: 5,
    createdAt: "2026-09-07T06:00:00Z",
    updatedAt: "2026-09-07T06:00:00Z",
    revision: 1,
    ...overrides,
  };
}

function native(overrides: Partial<NativeAlarmSnapshot> & { id: string }): NativeAlarmSnapshot {
  return {
    hour: 7,
    minute: 0,
    weekdays: [1, 2, 3, 4, 5],
    enabled: true,
    label: "",
    ...overrides,
  };
}

test("diff: no-op when native matches desired", () => {
  const a = alarm({ id: "a" });
  const diff = diffAlarms([native({ id: "a" })], [a]);
  assert.deepEqual(diff.toCancel, []);
  assert.deepEqual(diff.toSchedule, []);
});

test("diff: only changed alarms are touched (never full recreate)", () => {
  const current = [native({ id: "a" }), native({ id: "b", hour: 8 })];
  const desired = [alarm({ id: "a" }), alarm({ id: "b", hour: 8, minute: 30 })];
  const diff = diffAlarms(current, desired);
  assert.deepEqual(diff.toCancel, ["b"]);
  assert.deepEqual(diff.toSchedule.map((x) => x.id), ["b"]);
});

test("diff: removed alarm is cancelled, new alarm is scheduled", () => {
  const current = [native({ id: "old" })];
  const desired = [alarm({ id: "new" })];
  const diff = diffAlarms(current, desired);
  assert.deepEqual(diff.toCancel, ["old"]);
  assert.deepEqual(diff.toSchedule.map((x) => x.id), ["new"]);
});

test("diff: disabled alarm is cancelled and never scheduled", () => {
  const current = [native({ id: "x" })];
  const diff = diffAlarms(current, [alarm({ id: "x", enabled: false })]);
  assert.deepEqual(diff.toCancel, ["x"]);
  assert.deepEqual(diff.toSchedule, []);
});

test("diff: weekday change triggers update of exactly that alarm", () => {
  const current = [native({ id: "a" }), native({ id: "b", hour: 9, weekdays: [] })];
  const desired = [alarm({ id: "a", weekdays: [0, 6] }), alarm({ id: "b", hour: 9, weekdays: [] })];
  const diff = diffAlarms(current, desired);
  assert.deepEqual(diff.toCancel, ["a"]);
  assert.deepEqual(diff.toSchedule.map((x) => x.id), ["a"]);
});

test("merge: server wins when fresher, keeps local-only alarms", () => {
  const local = [alarm({ id: "local-only" }), alarm({ id: "both", revision: 1 })];
  const server = [alarm({ id: "both", revision: 3, minute: 45 })];
  const merged = mergeAlarmLists(local, server, 10, 12);
  assert.equal(merged.revision, 12);
  const ids = merged.alarms.map((a) => a.id);
  assert.ok(ids.includes("local-only"));
  const both = merged.alarms.find((a) => a.id === "both")!;
  assert.equal(both.minute, 45);
});

test("merge: local wins when fresher (will be pushed later)", () => {
  const local = [alarm({ id: "both", revision: 9, minute: 15 })];
  const server = [alarm({ id: "both", revision: 2, minute: 45 })];
  const merged = mergeAlarmLists(local, server, 30, 20);
  assert.equal(merged.alarms[0]!.minute, 15);
  assert.equal(merged.revision, 30);
});

test("nextEnabledAlarm picks the earliest enabled one and ignores past/pending", () => {
  const now = new Date("2026-09-07T19:00:00Z"); // 21:00 Amsterdam Monday
  const early = { ...alarm({ id: "early" }) };
  const late = { ...alarm({ id: "late" }) };
  const result = nextEnabledAlarm(
    [early, late, { ...alarm({ id: "off", enabled: false }) }],
    (a) => new Date(now.getTime() + (a.id === "early" ? 60_000 : 7200_000)),
    now,
  );
  assert.equal(result!.alarm.id, "early");
});
