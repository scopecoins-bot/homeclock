import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeHarness, auth, fakeMcpClient } from "./harness.js";
import { SomtodayService, normalizeLesson } from "../src/somtoday.js";
import type { Db } from "../src/db.js";

const fixturePath = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../test/fixtures/week.json",
);

interface FixtureItem {
  id: number;
  vak: string;
  begin: string;
  eind: string;
  beginLesuur?: number;
  locatie?: string;
  docent?: string;
  status: string;
  titel?: string;
  afspraakType?: string;
}

function loadFixture(): FixtureItem[] {
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as { data: FixtureItem[] };
  return raw.data;
}

test("real Somtoday fixture normalizes into lessons", () => {
  const items = loadFixture();
  assert.ok(items.length >= 5, "fixture should contain several lessons");
  const fetchedAt = new Date().toISOString();
  const lessons = items
    .map((item) => normalizeLesson(item, fetchedAt))
    .filter((l): l is NonNullable<typeof l> => l !== null);
  assert.equal(lessons.length, items.length);

  const first = lessons[0]!;
  assert.ok(first.id.length > 0);
  assert.match(first.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(first.subject.length > 0);
  assert.equal(first.cancelled, false);
  assert.equal(first.changed, false);
  assert.ok(Date.parse(first.startIso));
  assert.ok(Date.parse(first.endIso));
});

test("cancelled statuses map to cancelled flag", () => {
  const base = {
    id: 1,
    vak: "wiskunde",
    begin: "2026-09-07T08:30:00.000+02:00",
    eind: "2026-09-07T09:20:00.000+02:00",
    status: "ACTIEF",
  };
  const active = normalizeLesson(base, "2026-09-07T06:00:00Z");
  assert.equal(active!.cancelled, false);

  const cancelled = normalizeLesson({ ...base, status: "GEANNULEERD" }, "2026-09-07T06:00:00Z");
  assert.equal(cancelled!.cancelled, true);
  assert.equal(cancelled!.changed, false);

  const changed = normalizeLesson({ ...base, status: "VERPLAATST" }, "2026-09-07T06:00:00Z");
  assert.equal(changed!.cancelled, false);
  assert.equal(changed!.changed, true);
});

test("invalid items are skipped during normalization", () => {
  const bad = normalizeLesson({ id: 2, status: "ACTIEF" }, "x");
  assert.equal(bad, null);
});

test("schedule flows from MCP tool into db and API", async () => {
  const items = loadFixture();
  const h = await makeHarness(async (tool, args) => {
    if (tool === "somtoday_auth_status") {
      return { authenticated: true };
    }
    if (tool === "somtoday_get_schedule") {
      assert.equal(typeof (args as { from: string }).from, "string");
      return { from: "x", to: "y", count: items.length, items };
    }
    throw new Error(`unexpected tool ${tool}`);
  });

  const state = await h.somtoday.checkAuth();
  assert.equal(state, "ok");
  const count = await h.somtoday.refreshWindow();
  assert.ok(count >= items.length, `expected >= ${items.length}, got ${count}`);

  const today = h.somtoday.getLessons("2026-08-17", "2026-08-24");
  assert.ok(today.length > 0);

  const api = await h.app.inject({
    method: "GET",
    url: "/v1/schedule/week",
    headers: auth(h.token),
  });
  assert.equal(api.statusCode, 200);
  const body = api.json();
  assert.ok(Array.isArray(body.lessons));
});

test("real MCP nested ok() wrapper format is unwrapped", async () => {
  // The somtoday-mcp ok() helper returns { ok, data: {...} } — this guards the
  // live integration shape (regression for the needs_auth-after-login bug).
  const items = loadFixture();
  const h = await makeHarness(async (tool) => {
    if (tool === "somtoday_auth_status") {
      return {
        ok: true,
        data: { authenticated: true, apiUrl: "https://api.somtoday.nl" },
      };
    }
    if (tool === "somtoday_get_schedule") {
      return { ok: true, data: { from: "x", to: "y", count: items.length, items } };
    }
    throw new Error(`unexpected tool ${tool}`);
  });

  const state = await h.somtoday.checkAuth();
  assert.equal(state, "ok");
  const count = await h.somtoday.refreshWindow();
  assert.ok(count >= items.length);
  assert.equal(h.somtoday.state, "ok");
});

test("schedule is served from cache when MCP is offline", async () => {  const items = loadFixture();
  let calls = 0;
  const h = await makeHarness(async (tool) => {
    if (tool === "somtoday_auth_status") return { authenticated: true };
    if (tool === "somtoday_get_schedule") {
      calls += 1;
      if (calls === 1) return { from: "x", to: "y", count: items.length, items };
      throw new Error("MCP offline");
    }
    throw new Error(`unexpected tool ${tool}`);
  });

  await h.somtoday.refreshWindow();

  // Simulate MCP going away: force a failing client.
  const broken = new SomtodayService(
    fakeMcpClient(async () => {
      throw new Error("MCP offline");
    }),
    h.db as Db,
  );
  // Cache reads must still work.
  const lessons = broken.getLessons("2026-08-17", "2026-08-24");
  assert.ok(lessons.length > 0, "cached lessons survive MCP outage");
});
