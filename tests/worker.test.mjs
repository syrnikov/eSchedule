import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../worker/worker.js";

const ORIGIN = "https://syrnikov.github.io";
const ENV = { ALLOWED_ORIGINS: ORIGIN };
const FEED = JSON.stringify({ source: "t", cachedat: "x", states: { "Одеська область": { alertnow: false } } });

// Fake upstream that counts calls; clock we can move.
function setup(respond = () => new Response(FEED, { status: 200 })) {
  let clock = 0;
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return respond(); };
  const handle = createHandler({ fetchImpl, now: () => clock });
  return { handle, calls, advance: (ms) => { clock += ms; } };
}
const get = (origin) => new Request("https://pary-alarm.example.workers.dev/", {
  headers: origin ? { Origin: origin } : {},
});

test("proxies the feed with CORS for our origin only", async () => {
  const { handle, calls } = setup();
  const res = await handle(get(ORIGIN), ENV);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(res.headers.get("Vary"), "Origin");
  assert.equal(await res.text(), FEED);
  assert.equal(calls[0].url, "https://ubilling.net.ua/aerialalerts/");
  assert.match(calls[0].init.headers["User-Agent"], /pary-alarm-proxy/);
});

test("other origins get no CORS header (the browser will block them)", async () => {
  const { handle } = setup();
  const res = await handle(get("https://evil.example"), ENV);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  const star = await handle(get(ORIGIN), { ALLOWED_ORIGINS: "" });
  assert.equal(star.headers.get("Access-Control-Allow-Origin"), null);
});

test("caches for 60 seconds", async () => {
  const { handle, calls, advance } = setup();
  await handle(get(ORIGIN), ENV);
  advance(59_000);
  await handle(get(ORIGIN), ENV);
  assert.equal(calls.length, 1);
  advance(2_000);
  await handle(get(ORIGIN), ENV);
  assert.equal(calls.length, 2);
});

test("upstream errors become a clear JSON 502, still with CORS", async () => {
  for (const respond of [
    () => new Response("down", { status: 503 }),
    () => new Response("<html>not json</html>", { status: 200 }),
    () => new Response(JSON.stringify({ nope: 1 }), { status: 200 }),
    () => { throw new Error("network"); },
  ]) {
    const { handle } = setup(respond);
    const res = await handle(get(ORIGIN), ENV);
    assert.equal(res.status, 502);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
    assert.equal((await res.json()).error, "upstream_unavailable");
  }
});

test("a failed fetch is not cached", async () => {
  let fail = true;
  const { handle, calls } = setup(() => (fail ? new Response("x", { status: 500 }) : new Response(FEED)));
  assert.equal((await handle(get(ORIGIN), ENV)).status, 502);
  fail = false;
  assert.equal((await handle(get(ORIGIN), ENV)).status, 200);
  assert.equal(calls.length, 2);
});

test("OPTIONS preflight and non-GET methods", async () => {
  const { handle } = setup();
  const pre = await handle(new Request("https://x.dev/", { method: "OPTIONS", headers: { Origin: ORIGIN } }), ENV);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("Access-Control-Allow-Methods"), "GET");
  const post = await handle(new Request("https://x.dev/", { method: "POST", headers: { Origin: ORIGIN } }), ENV);
  assert.equal(post.status, 405);
});
