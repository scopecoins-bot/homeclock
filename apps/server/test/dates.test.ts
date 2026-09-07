import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, nextOccurrence, tzOffsetMinutes, weekRange, weekdayOf } from "../src/dates.js";

test("addDays handles month and year boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-09-07", -7), "2026-08-31");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
});

test("weekdayOf matches known calendar days", () => {
  // 2026-09-07 is a Monday
  assert.equal(weekdayOf("2026-09-07"), 1);
  // 2026-09-06 is a Sunday
  assert.equal(weekdayOf("2026-09-06"), 0);
  // 2026-09-12 is a Saturday
  assert.equal(weekdayOf("2026-09-12"), 6);
});

test("weekRange returns Monday..Sunday", () => {
  const { from, to } = weekRange("2026-09-07");
  assert.equal(from, "2026-09-07");
  assert.equal(to, "2026-09-13");
  const sunday = weekRange("2026-09-13");
  assert.equal(sunday.from, "2026-09-07");
  assert.equal(sunday.to, "2026-09-13");
});

test("tzOffsetMinutes knows about DST in Europe/Amsterdam", () => {
  // Summer time (CEST, UTC+2)
  assert.equal(tzOffsetMinutes(new Date("2026-07-01T12:00:00Z")), 120);
  // Winter time (CET, UTC+1)
  assert.equal(tzOffsetMinutes(new Date("2026-12-01T12:00:00Z")), 60);
});

interface WallClock {
  date: string;
  hour: string;
  minute: string;
}

function wallClock(instant: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: get("hour").replace(/^24$/, "00"),
    minute: get("minute"),
  };
}

test("nextOccurrence respects Amsterdam wall clock", () => {
  // 2026-09-07 21:00 Amsterdam == 19:00 UTC (CEST)
  const now = new Date("2026-09-07T19:00:00Z");
  // 07:00 tomorrow (Tuesday) Amsterdam
  const next = nextOccurrence(7, 0, [1, 2, 3, 4, 5], now);
  assert.deepEqual(wallClock(next), { date: "2026-09-08", hour: "07", minute: "00" });
});

test("nextOccurrence skips days not in weekday set", () => {
  // Friday 2026-09-11 21:00 Amsterdam
  const now = new Date("2026-09-11T19:00:00Z");
  // Monday-only alarm => next is Monday 2026-09-14
  const next = nextOccurrence(7, 30, [1], now);
  assert.deepEqual(wallClock(next), { date: "2026-09-14", hour: "07", minute: "30" });
});

test("nextOccurrence with empty weekdays fires tomorrow at the same time when passed", () => {
  const now = new Date("2026-09-07T19:00:00Z"); // 21:00 Amsterdam
  const next = nextOccurrence(21, 0, [], now); // 21:00 already passed today
  assert.deepEqual(wallClock(next), { date: "2026-09-08", hour: "21", minute: "00" });
});

test("nextOccurrence fires later today when still ahead", () => {
  const now = new Date("2026-09-07T19:00:00Z"); // 21:00 Amsterdam
  const next = nextOccurrence(22, 15, [1], now);
  assert.deepEqual(wallClock(next), { date: "2026-09-07", hour: "22", minute: "15" });
});
