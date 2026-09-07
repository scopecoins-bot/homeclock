import { test } from "node:test";
import assert from "node:assert/strict";
import { makeHarness, auth } from "./harness.js";
import { wmoDescription } from "../src/weather.js";

const OPEN_METEO_FIXTURE = {
  current: { temperature_2m: 17.42, weather_code: 3 },
  daily: {
    temperature_2m_max: [21.1],
    temperature_2m_min: [11.3],
    precipitation_probability_max: [42],
  },
};

function okFetch(json: unknown): (url: string) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
}

test("wmo codes map to Dutch descriptions", () => {
  assert.equal(wmoDescription(0), "Helder");
  assert.equal(wmoDescription(63), "Regen");
  assert.ok(wmoDescription(999).length > 0);
});

test("weather refresh + persistence + API", async () => {
  const h = await makeHarness(undefined, okFetch(OPEN_METEO_FIXTURE));

  await h.weather.refresh();
  assert.equal(h.weather.state, "ok");
  const current = h.weather.current();
  assert.ok(current);
  assert.equal(current!.locationName.length > 0, true);
  assert.equal(current!.now.temperature, 17.4);
  assert.equal(current!.now.condition, "Bewolkt");
  assert.equal(current!.high, 21.1);
  assert.equal(current!.low, 11.3);
  assert.equal(current!.precipitationChance, 42);

  const api = await h.app.inject({ method: "GET", url: "/v1/weather", headers: auth(h.token) });
  assert.equal(api.statusCode, 200);
  assert.equal(api.json().now.condition, "Bewolkt");
});

test("weather failure keeps last valid cache and does not throw", async () => {
  let failing = false;
  const h = await makeHarness(
    undefined,
    async () => {
      if (failing) throw new Error("network down");
      return new Response(JSON.stringify(OPEN_METEO_FIXTURE), { status: 200 });
    },
  );

  await h.weather.refresh();
  assert.equal(h.weather.state, "ok");

  failing = true;
  await h.weather.refresh();
  // stale-but-present cache keeps state ok
  assert.equal(h.weather.state, "ok");
  assert.ok(h.weather.current(), "stale weather must remain available");
});

test("settings patch updates weather location and validates", async () => {
  const h = await makeHarness();

  const patch = await h.app.inject({
    method: "PATCH",
    url: "/v1/settings",
    headers: auth(h.token),
    payload: { weather: { locationName: "Gorredijk", latitude: 52.98, longitude: 6.05 } },
  });
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().weather.locationName, "Gorredijk");

  const bad = await h.app.inject({
    method: "PATCH",
    url: "/v1/settings",
    headers: auth(h.token),
    payload: { weather: { locationName: "", latitude: 200, longitude: 0 } },
  });
  assert.equal(bad.statusCode, 400);

  const get = await h.app.inject({ method: "GET", url: "/v1/settings", headers: auth(h.token) });
  assert.equal(get.json().timezone, "Europe/Amsterdam");
});

test("dashboard aggregates alarms, lessons and weather", async () => {
  const items = [
    {
      id: 5001,
      vak: "wiskunde",
      begin: "2026-09-08T08:30:00.000+02:00",
      eind: "2026-09-08T09:20:00.000+02:00",
      status: "ACTIEF",
      locatie: "B1.14",
      docent: "VDM",
    },
  ];
  const h = await makeHarness(
    async (tool) => (tool === "somtoday_auth_status" ? { authenticated: true } : { count: 1, items }),
    okFetch(OPEN_METEO_FIXTURE),
  );
  await h.somtoday.checkAuth();
  await h.somtoday.refreshWindow();
  await h.weather.refresh();
  await h.app.inject({
    method: "POST",
    url: "/v1/alarms",
    headers: auth(h.token),
    payload: { hour: 7, minute: 0, weekdays: [1, 2, 3, 4, 5] },
  });

  const res = await h.app.inject({ method: "GET", url: "/v1/dashboard", headers: auth(h.token) });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.nextAlarm, "dashboard should surface the next alarm");
  assert.equal(body.nextAlarm!.hour, 7);
  assert.equal(body.somtoday.state, "ok");
});
