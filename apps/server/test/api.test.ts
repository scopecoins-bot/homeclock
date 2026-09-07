import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHarness, auth } from "./harness.js";

test("health endpoint is open and reports database state", async () => {
  const h = await makeHarness();
  const res = await h.app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.equal(body.database, "ok");
});

test("v1 endpoints require a bearer token", async () => {
  const h = await makeHarness();
  for (const url of [
    "/v1/status",
    "/v1/alarms",
    "/v1/dashboard",
    "/v1/settings",
    "/v1/schedule/today",
  ]) {
    const res = await h.app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 401, `${url} should require auth`);
  }
  // invalid token
  const bad = await h.app.inject({
    method: "GET",
    url: "/v1/alarms",
    headers: { authorization: "Bearer hc_nope" },
  });
  assert.equal(bad.statusCode, 401);
  // malformed header
  const malformed = await h.app.inject({
    method: "GET",
    url: "/v1/alarms",
    headers: { authorization: "Basic abc" },
  });
  assert.equal(malformed.statusCode, 401);
});

test("alarm CRUD with revisions", async () => {
  const h = await makeHarness();

  // create
  const create = await h.app.inject({
    method: "POST",
    url: "/v1/alarms",
    headers: auth(h.token),
    payload: { hour: 7, minute: 0, label: "Werkdagen", weekdays: [1, 2, 3, 4, 5] },
  });
  assert.equal(create.statusCode, 201);
  const created = create.json();
  assert.equal(created.hour, 7);
  assert.equal(created.enabled, true);
  assert.deepEqual(created.weekdays, [1, 2, 3, 4, 5]);
  assert.ok(created.id);

  // list
  const list1 = (await h.app.inject({ method: "GET", url: "/v1/alarms", headers: auth(h.token) })).json();
  assert.equal(list1.alarms.length, 1);
  const revAfterCreate = list1.revision;

  // patch
  const patch = await h.app.inject({
    method: "PATCH",
    url: `/v1/alarms/${created.id}`,
    headers: auth(h.token),
    payload: { minute: 30, enabled: false },
  });
  assert.equal(patch.statusCode, 200);
  const patched = patch.json();
  assert.equal(patched.minute, 30);
  assert.equal(patched.enabled, false);
  assert.ok(patched.revision > created.revision);

  // list revision increased
  const list2 = (await h.app.inject({ method: "GET", url: "/v1/alarms", headers: auth(h.token) })).json();
  assert.ok(list2.revision > revAfterCreate);

  // delete
  const del = await h.app.inject({
    method: "DELETE",
    url: `/v1/alarms/${created.id}`,
    headers: auth(h.token),
  });
  assert.equal(del.statusCode, 200);
  const list3 = (await h.app.inject({ method: "GET", url: "/v1/alarms", headers: auth(h.token) })).json();
  assert.equal(list3.alarms.length, 0);

  // 404 after delete
  const delAgain = await h.app.inject({
    method: "DELETE",
    url: `/v1/alarms/${created.id}`,
    headers: auth(h.token),
  });
  assert.equal(delAgain.statusCode, 404);
});

test("alarm validation rejects bad payloads", async () => {
  const h = await makeHarness();
  const bad1 = await h.app.inject({
    method: "POST",
    url: "/v1/alarms",
    headers: auth(h.token),
    payload: { hour: 25, minute: 0 },
  });
  assert.equal(bad1.statusCode, 400);
  const bad2 = await h.app.inject({
    method: "POST",
    url: "/v1/alarms",
    headers: auth(h.token),
    payload: { hour: 7, weekdays: [9] },
  });
  assert.equal(bad2.statusCode, 400);
});

test("client-provided stable ids are preserved", async () => {
  const h = await makeHarness();
  const id = "123e4567-e89b-12d3-a456-426614174000";
  const create = await h.app.inject({
    method: "POST",
    url: "/v1/alarms",
    headers: auth(h.token),
    payload: { id, hour: 6, minute: 45 },
  });
  assert.equal(create.statusCode, 201);
  assert.equal(create.json().id, id);
});

test("pairing: bad codes rejected, valid code exchanges once", async () => {
  const h = await makeHarness();

  const bad = await h.app.inject({
    method: "POST",
    url: "/v1/pair/exchange",
    payload: { code: "XXXX-XXXX", deviceName: "Ghost" },
  });
  assert.equal(bad.statusCode, 403);

  const { createPairingCode } = await import("../src/auth.js");
  const code = createPairingCode(h.db, "Second iPad");
  const good = await h.app.inject({
    method: "POST",
    url: "/v1/pair/exchange",
    payload: { code, deviceName: "Second iPad" },
  });
  assert.equal(good.statusCode, 200);
  const { token } = good.json();
  assert.ok(token.startsWith("hc_"));

  // reuse must fail
  const reuse = await h.app.inject({
    method: "POST",
    url: "/v1/pair/exchange",
    payload: { code, deviceName: "Second iPad" },
  });
  assert.equal(reuse.statusCode, 403);

  // new token works
  const list = await h.app.inject({ method: "GET", url: "/v1/alarms", headers: auth(token) });
  assert.equal(list.statusCode, 200);
});

test("heartbeat updates device and returns current revision", async () => {
  const h = await makeHarness();
  const res = await h.app.inject({
    method: "POST",
    url: "/v1/device/heartbeat",
    headers: auth(h.token),
    payload: { appVersion: "1.0.0", syncRevision: 0, alarmEngine: "alarmkit", alarmKitScheduledCount: 2 },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.ok, true);
  assert.ok(body.revision >= 0);

  const row = h.db.prepare("SELECT app_version, alarm_engine FROM devices").get() as {
    app_version: string;
    alarm_engine: string;
  };
  assert.equal(row.app_version, "1.0.0");
  assert.equal(row.alarm_engine, "alarmkit");
});
