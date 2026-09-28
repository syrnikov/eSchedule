// Web Push: crypto against the RFC, the subscription API, and the cron job end to end.
// D1 is played by node:sqlite running the real migration; pushes are decrypted with the
// "browser's" private key, so we check exactly what a phone would receive.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { encryptPayload, vapidHeader, b64urlEncode, b64urlDecode } from "../worker/webpush.js";
import { validateSubscribe, runCron, MAX_SENDS_PER_RUN } from "../worker/push.js";
import { createHandler } from "../worker/worker.js";
import { isIos, detectSupport, groupKey, cleanPrefs, keyBytes } from "../js/push.js";
import { kyivLocalToDate } from "../js/format.js";
import { buildSchedule } from "../scraper/scrape.mjs";

const subtle = crypto.subtle;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// --- Fakes ---

const migration = await read("worker/migrations/0001_subscriptions.sql");
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    run: async () => { db.prepare(sql).run(...args); return { success: true }; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    exec: () => db.prepare(sql).run(...args),
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => list.map((s) => s.exec()), sql: db };
}
function fakeKV() {
  const map = new Map();
  return {
    map,
    get: async (key, type) => (map.has(key) ? (type === "json" ? JSON.parse(map.get(key)) : map.get(key)) : null),
    put: async (key, value) => { map.set(key, value); },
  };
}

const GROUP = "208-бак-3к денне 26-27|1б";
const SCHEDULE_URL = "https://pages.test/data/schedule.json";
const ORIGIN = "https://syrnikov.github.io";
const fixture = JSON.parse(await read("scraper/fixtures/schedule-2026-09-28_2026-10-04.json"));
const scheduleJson = JSON.stringify(buildSchedule(fixture, {
  now: new Date("2026-09-28T03:00:00Z"), rangeFrom: "2026-09-28", rangeTo: "2026-10-11",
}));

async function vapidKeys() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return {
    publicKey: b64urlEncode(await subtle.exportKey("raw", pair.publicKey)),
    privateKey: (await subtle.exportKey("jwk", pair.privateKey)).d,
    verifyKey: pair.publicKey,
  };
}

// A fake browser: its keys, and a decryptor for what the push service would hand it.
async function fakeBrowser(n) {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const endpoint = `https://fcm.googleapis.com/fcm/send/device-${n}`;
  return {
    endpoint,
    subscription: { endpoint, keys: { p256dh: b64urlEncode(pub), auth: b64urlEncode(auth) } },
    async decrypt(body) {
      const salt = body.slice(0, 16);
      const idlen = body[20];
      const asPub = body.slice(21, 21 + idlen);
      const cipher = body.slice(21 + idlen);
      const asKey = await subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const secret = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: asKey }, pair.privateKey, 256));
      const hk = async (s, ikm, info, len) => new Uint8Array(await subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: s, info: new TextEncoder().encode(info) },
        await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), len * 8));
      const keyInfo = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...pub, ...asPub]);
      const ikm = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: auth, info: keyInfo },
        await subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]), 256));
      const cek = await hk(salt, ikm, "Content-Encoding: aes128gcm\0", 16);
      const nonce = await hk(salt, ikm, "Content-Encoding: nonce\0", 12);
      const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce },
        await subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]), cipher));
      assert.equal(plain.at(-1), 2, "last-record delimiter");
      return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
    },
  };
}

// World: env + a fake network (schedule, alarm feed, push services).
async function world() {
  const keys = await vapidKeys();
  const env = {
    ALLOWED_ORIGINS: ORIGIN,
    VAPID_PUBLIC_KEY: keys.publicKey,
    VAPID_PRIVATE_KEY: keys.privateKey,
    VAPID_SUBJECT: "https://syrnikov.github.io/eSchedule/",
    GROUPS: { [GROUP]: { schedule: SCHEDULE_URL, region: "Одеська область" } },
    DB: fakeD1(),
    CACHE: fakeKV(),
  };
  const net = { alert: false, pushStatus: () => 201, pushes: [], scheduleFetches: 0 };
  const fetchImpl = async (url, init = {}) => {
    if (url === SCHEDULE_URL) { net.scheduleFetches++; return new Response(scheduleJson); }
    if (url.startsWith("https://ubilling.net.ua/")) {
      return new Response(JSON.stringify({ states: { "Одеська область": { alertnow: net.alert } } }));
    }
    net.pushes.push({ url, init });
    return new Response(null, { status: net.pushStatus(url) });
  };
  const handle = createHandler({ fetchImpl });
  const api = (path, body, origin = ORIGIN) => handle(new Request(`https://w.test${path}`, {
    method: body ? "POST" : "GET",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  const cron = (local) => runCron(env, kyivLocalToDate(local), { fetchImpl });
  const rows = () => env.DB.sql.prepare("SELECT * FROM subscriptions ORDER BY endpoint").all();
  return { env, net, api, cron, rows, keys };
}

const prefs = (p = {}) => ({ reminders: true, lead: 5, alerts: false, ...p });
async function subscribe(w, browser, p) {
  const res = await w.api("/push/subscribe", { subscription: browser.subscription, group: GROUP, prefs: prefs(p) });
  assert.equal(res.status, 200, await res.clone().text());
}

// --- Crypto ---

describe("webpush crypto", () => {
  test("encryption matches the RFC 8291 example byte for byte", async () => {
    const out = await encryptPayload(b64urlDecode("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24"), {
      p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
      auth: "BTBZMqHH6r4Tts7J_aSIgg",
    }, {
      salt: "DGv6ra1nlYgDCS1FRnbzlw",
      serverPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
      serverPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    });
    assert.equal(b64urlEncode(out),
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN");
  });

  test("VAPID JWT: right audience, expiry and a valid ES256 signature", async () => {
    const keys = await vapidKeys();
    const header = await vapidHeader("https://fcm.googleapis.com/fcm/send/abc", { ...keys, subject: "https://x.test/" }, 1_000_000);
    const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.equal(k, keys.publicKey);
    const [h, c, sig] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
    assert.deepEqual(claims, { aud: "https://fcm.googleapis.com", exp: 1_000_000 + 12 * 3600, sub: "https://x.test/" });
    const ok = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, keys.verifyKey, b64urlDecode(sig),
      new TextEncoder().encode(`${h}.${c}`));
    assert.ok(ok);
  });
});

// --- Validation ---

describe("subscription validation", () => {
  const groups = { [GROUP]: {} };
  const good = async () => ({ subscription: (await fakeBrowser(1)).subscription, group: GROUP, prefs: prefs() });

  test("accepts a real-looking subscription", async () => {
    const row = validateSubscribe(await good(), groups);
    assert.equal(row.group, GROUP);
    assert.equal(row.lead, 5);
  });

  test("rejects unknown push hosts, bad keys, unknown groups and odd prefs", async () => {
    const base = await good();
    const bad = [
      { ...base, subscription: { ...base.subscription, endpoint: "https://evil.example/push" } },
      { ...base, subscription: { ...base.subscription, endpoint: "http://fcm.googleapis.com/x" } },
      { ...base, subscription: { ...base.subscription, endpoint: "https://fcm.googleapis.com.evil.example/x" } },
      { ...base, subscription: { ...base.subscription, keys: { p256dh: "abc", auth: base.subscription.keys.auth } } },
      { ...base, subscription: { ...base.subscription, keys: { p256dh: base.subscription.keys.p256dh, auth: "abc" } } },
      { ...base, group: "інша група|1а" },
      { ...base, group: "__proto__" },
      { ...base, prefs: { ...base.prefs, lead: 7 } },
      { ...base, prefs: { ...base.prefs, reminders: "yes" } },
      null,
    ];
    for (const body of bad) assert.throws(() => validateSubscribe(body, groups), JSON.stringify(body)?.slice(0, 80));
  });
});

// --- API ---

describe("push API", () => {
  test("key, subscribe, update, unsubscribe", async () => {
    const w = await world();
    const b = await fakeBrowser(1);
    assert.deepEqual(await (await w.api("/push/key")).json(), { publicKey: w.keys.publicKey });

    await subscribe(w, b);
    let [row] = w.rows();
    assert.equal(row.grp, GROUP);
    assert.equal(row.lead, 5);
    assert.ok(row.created_at && row.updated_at);
    // Nothing personal is stored.
    assert.deepEqual(Object.keys(row).sort(), [
      "alerts", "auth", "created_at", "endpoint", "grp", "last_alert", "last_reminder", "lead", "p256dh",
      "reminders", "updated_at",
    ]);

    await subscribe(w, b, { lead: 15, alerts: true });
    [row] = w.rows();
    assert.equal(w.rows().length, 1);
    assert.equal(row.lead, 15);
    assert.equal(row.alerts, 1);

    const off = await w.api("/push/unsubscribe", { endpoint: b.endpoint });
    assert.equal(off.status, 200);
    assert.equal(w.rows().length, 0);
  });

  test("turning everything off deletes the row", async () => {
    const w = await world();
    const b = await fakeBrowser(1);
    await subscribe(w, b);
    await subscribe(w, b, { reminders: false, alerts: false });
    assert.equal(w.rows().length, 0);
  });

  test("other origins can't subscribe; bad input is a 400", async () => {
    const w = await world();
    const b = await fakeBrowser(1);
    const body = { subscription: b.subscription, group: GROUP, prefs: prefs() };
    assert.equal((await w.api("/push/subscribe", body, "https://evil.example")).status, 403);
    assert.equal((await w.api("/push/subscribe", { ...body, group: "x" })).status, 400);
    assert.equal((await w.api("/push/subscribe", { junk: "x".repeat(5000) })).status, 413);
    assert.equal(w.rows().length, 0);
  });
});

// --- Cron ---

describe("cron reminders", () => {
  test("«Через 5 хв — …» once, with only subject, type, teacher and time", async () => {
    const w = await world();
    const b = await fakeBrowser(1);
    await subscribe(w, b);

    await w.cron("2026-09-28T08:09"); // 6 min before: not yet for lead 5
    assert.equal(w.net.pushes.length, 0);

    await w.cron("2026-09-28T08:10");
    assert.equal(w.net.pushes.length, 1);
    const { url, init } = w.net.pushes[0];
    assert.equal(url, b.endpoint);
    assert.equal(init.headers["Content-Encoding"], "aes128gcm");
    assert.equal(init.headers.TTL, "300");
    const msg = await b.decrypt(new Uint8Array(init.body));
    assert.deepEqual(Object.keys(msg).sort(), ["body", "tag", "title"]);
    assert.equal(msg.title.replace(/ /g, " "), "Через 5 хв — Іноземна мова 🎓");
    assert.equal(msg.body, "Практичні · Насакіна С. В. · початок о 08:15");
    assert.doesNotMatch(JSON.stringify(msg), /https?:/);

    await w.cron("2026-09-28T08:11"); // same class: no repeat
    assert.equal(w.net.pushes.length, 1);
  });

  test("lead time 15 fires earlier; lead 5 waits", async () => {
    const w = await world();
    const early = await fakeBrowser(1);
    const late = await fakeBrowser(2);
    await subscribe(w, early, { lead: 15 });
    await subscribe(w, late, { lead: 5 });
    await w.cron("2026-09-28T08:00");
    assert.deepEqual(w.net.pushes.map((p) => p.url), [early.endpoint]);
    const msg = await early.decrypt(new Uint8Array(w.net.pushes[0].init.body));
    assert.match(msg.title, /^Через 15/);
    await w.cron("2026-09-28T08:10");
    assert.deepEqual(w.net.pushes.map((p) => p.url), [early.endpoint, late.endpoint]);
  });

  test("410 removes the subscription; 500 is retried next minute", async () => {
    const w = await world();
    const gone = await fakeBrowser(1);
    const flaky = await fakeBrowser(2);
    await subscribe(w, gone);
    await subscribe(w, flaky);
    let flakyFails = true;
    w.net.pushStatus = (url) => (url === gone.endpoint ? 410 : flakyFails ? 500 : 201);

    await w.cron("2026-09-28T08:10");
    assert.deepEqual(w.rows().map((r) => r.endpoint), [flaky.endpoint]);
    assert.equal(w.rows()[0].last_reminder, null);

    flakyFails = false;
    await w.cron("2026-09-28T08:11");
    assert.equal(w.rows()[0].last_reminder, "2026-09-28 08:15");
  });

  test("more subscribers than one run can send: the rest go next minute", async () => {
    const w = await world();
    const browsers = await Promise.all(Array.from({ length: MAX_SENDS_PER_RUN + 5 }, (_, i) => fakeBrowser(i)));
    for (const b of browsers) await subscribe(w, b);
    await w.cron("2026-09-28T08:10");
    assert.equal(w.net.pushes.length, MAX_SENDS_PER_RUN);
    await w.cron("2026-09-28T08:11");
    assert.equal(w.net.pushes.length, browsers.length);
    assert.equal(new Set(w.net.pushes.map((p) => p.url)).size, browsers.length);
  });

  test("schedule is cached, not fetched every minute", async () => {
    const w = await world();
    await w.cron("2026-09-28T08:00");
    await w.cron("2026-09-28T08:01");
    await w.cron("2026-09-28T08:29");
    assert.equal(w.net.scheduleFetches, 1);
    await w.cron("2026-09-28T08:31");
    assert.equal(w.net.scheduleFetches, 2);
  });

  test("nothing without VAPID keys", async () => {
    const w = await world();
    await subscribe(w, await fakeBrowser(1));
    w.env.VAPID_PRIVATE_KEY = "";
    assert.deepEqual(await w.cron("2026-09-28T08:10"), { sent: 0 });
    assert.equal(w.net.pushes.length, 0);
  });
});

describe("cron alert pushes (opt-in)", () => {
  test("start and end during a class, with how long it lasted; only for opted-in", async () => {
    const w = await world();
    const opted = await fakeBrowser(1);
    const not = await fakeBrowser(2);
    await subscribe(w, opted, { reminders: false, alerts: true });
    await subscribe(w, not, { reminders: false, alerts: false }); // deleted: wants nothing
    const messages = async () => Promise.all(w.net.pushes.map((p) => opted.decrypt(new Uint8Array(p.init.body))));

    await w.cron("2026-09-28T08:20"); // first reading: no push
    w.net.alert = true;
    await w.cron("2026-09-28T08:30");
    await w.cron("2026-09-28T08:31"); // still on: no repeat
    w.net.alert = false;
    await w.cron("2026-09-28T08:53");

    const msgs = await messages();
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].title, "Повітряна тривога · Одеська область");
    assert.equal(msgs[0].body, "Пара на паузі. Бережи себе 🙏");
    assert.equal(msgs[1].title, "Відбій! Повертаємось на пару 🙌");
    assert.equal(msgs[1].body.replace(/ /g, " "), "Тривога тривала 23 хв");
    assert.ok(w.net.pushes.every((p) => p.url === opted.endpoint));
  });

  test("an alert outside class time sends nothing", async () => {
    const w = await world();
    await subscribe(w, await fakeBrowser(1), { reminders: false, alerts: true });
    await w.cron("2026-09-28T13:00");
    w.net.alert = true;
    await w.cron("2026-09-28T13:01");
    assert.equal(w.net.pushes.length, 0);
  });
});

// --- Browser-side helpers ---

describe("client push helpers", () => {
  test("iOS detection, including iPadOS pretending to be a Mac", () => {
    assert.ok(isIos({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }));
    assert.ok(isIos({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }));
    assert.ok(!isIos({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }));
    assert.ok(!isIos({ userAgent: "Mozilla/5.0 (Linux; Android 14)" }));
  });

  test("support: iOS Safari tab asks to install first; denied and unsupported are distinct", () => {
    const ok = { ios: false, standalone: false, hasPush: true, permission: "default" };
    assert.equal(detectSupport(ok), "ok");
    assert.equal(detectSupport({ ...ok, ios: true }), "ios-install");
    assert.equal(detectSupport({ ...ok, ios: true, standalone: true }), "ok");
    assert.equal(detectSupport({ ...ok, hasPush: false }), "unsupported");
    assert.equal(detectSupport({ ...ok, permission: "denied" }), "denied");
  });

  test("group key and prefs cleanup", () => {
    assert.equal(groupKey(JSON.parse(scheduleJson)), GROUP);
    assert.equal(groupKey(null), null);
    assert.deepEqual(cleanPrefs({ reminders: true, lead: 7, alerts: "yes" }), { reminders: true, lead: 5, alerts: false });
    assert.deepEqual([...keyBytes(b64urlEncode(new Uint8Array([1, 2, 250])))], [1, 2, 250]);
  });
});
