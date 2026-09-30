// Push reminders: the subscription API and the every-minute cron job.
//
// Storage:
//   env.DB    (D1)  subscriptions, see migrations/0001_subscriptions.sql
//   env.CACHE (KV)  "schedule:<url>"  cached schedule JSON (refreshed every 30 min)
//                   "alarm:<region>"  last alarm state we saw (written only when it changes)
// Config (wrangler.toml): GROUPS, VAPID_PUBLIC_KEY, VAPID_SUBJECT; secret: VAPID_PRIVATE_KEY.
//
// Meeting links and names never reach this code: the browser only sends its push
// subscription, its group and its preferences.

import { STRINGS } from "../js/strings.js";
import { kyivParts, toMinutes, formatDuration } from "../js/format.js";
import { validateSchedule } from "../js/schedule.js";
import { SOON_MINUTES } from "../js/status.js";
import { sendPush, b64urlDecode } from "./webpush.js";

export const LEADS = [5, 10, 15];
const MAX_LEAD = Math.max(...LEADS);
const MAX_BODY_BYTES = 4096;
const MAX_ENDPOINT_LENGTH = 1024;
const SCHEDULE_FRESH_MS = 30 * 60_000;
const SCHEDULE_KEEP_SECONDS = 3 * 86_400; // stale copy to fall back on if Pages is down
const ALERT_PUSH_WINDOW_MS = 10 * 60_000; // alert pushes older than this aren't worth sending
// Free Workers plan: 50 outgoing requests per run. Whatever doesn't fit goes out next minute
// (the dedupe columns make that safe).
export const MAX_SENDS_PER_RUN = 40;
const ALARM_FEED_URL = "https://ubilling.net.ua/aerialalerts/";

// Push services we'll talk to. Anything else is refused, so the Worker can't be
// used to POST to arbitrary URLs.
const PUSH_HOSTS = [
  "fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com",
  "push.apple.com", "notify.windows.com",
];
const isPushHost = (host) => PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

// GROUPS: { "group|subgroup": { schedule: "https://…/schedule.json", region: "Одеська область" } }
export function parseGroups(env) {
  const raw = env.GROUPS ?? {};
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// --- Validation (pure) ---

// Returns a clean row, or throws with a short reason.
export function validateSubscribe(body, groups) {
  const sub = body?.subscription;
  const endpoint = sub?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) throw new Error("bad endpoint");
  let url;
  try { url = new URL(endpoint); } catch { throw new Error("bad endpoint"); }
  if (url.protocol !== "https:" || !isPushHost(url.hostname)) throw new Error("unknown push service");

  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  const decodes = (v, len) => {
    try { return typeof v === "string" && v.length < 200 && b64urlDecode(v).length === len; } catch { return false; }
  };
  if (!decodes(p256dh, 65) || !decodes(auth, 16)) throw new Error("bad keys");

  const group = body.group;
  if (typeof group !== "string" || !Object.hasOwn(groups, group)) throw new Error("unknown group");

  const prefs = body.prefs ?? {};
  if (typeof prefs.reminders !== "boolean" || typeof prefs.alerts !== "boolean") throw new Error("bad prefs");
  if (!LEADS.includes(prefs.lead)) throw new Error("bad lead");

  return { endpoint, p256dh, auth, group, reminders: prefs.reminders, lead: prefs.lead, alerts: prefs.alerts };
}

// --- D1 access ---

export function createStore(db) {
  return {
    async upsert(row, nowIso) {
      await db.prepare(
        `INSERT INTO subscriptions (endpoint, p256dh, auth, grp, reminders, lead, alerts, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT(endpoint) DO UPDATE SET
           p256dh = excluded.p256dh, auth = excluded.auth, grp = excluded.grp,
           reminders = excluded.reminders, lead = excluded.lead, alerts = excluded.alerts,
           updated_at = excluded.updated_at`,
      ).bind(row.endpoint, row.p256dh, row.auth, row.group, row.reminders ? 1 : 0, row.lead, row.alerts ? 1 : 0, nowIso).run();
    },
    async remove(endpoint) {
      await db.prepare("DELETE FROM subscriptions WHERE endpoint = ?1").bind(endpoint).run();
    },
    async dueReminders(group, minutesUntil, key, limit) {
      const { results } = await db.prepare(
        `SELECT endpoint, p256dh, auth FROM subscriptions
         WHERE grp = ?1 AND reminders = 1 AND lead >= ?2 AND (last_reminder IS NULL OR last_reminder != ?3)
         LIMIT ?4`,
      ).bind(group, minutesUntil, key, limit).all();
      return results;
    },
    async dueAlerts(group, key, limit) {
      const { results } = await db.prepare(
        `SELECT endpoint, p256dh, auth FROM subscriptions
         WHERE grp = ?1 AND alerts = 1 AND (last_alert IS NULL OR last_alert != ?2)
         LIMIT ?3`,
      ).bind(group, key, limit).all();
      return results;
    },
    async mark(column, endpoints, key) {
      if (!endpoints.length) return;
      const sql = column === "last_alert"
        ? "UPDATE subscriptions SET last_alert = ?1 WHERE endpoint = ?2"
        : "UPDATE subscriptions SET last_reminder = ?1 WHERE endpoint = ?2";
      await db.batch(endpoints.map((e) => db.prepare(sql).bind(key, e)));
    },
    async removeMany(endpoints) {
      if (!endpoints.length) return;
      await db.batch(endpoints.map((e) => db.prepare("DELETE FROM subscriptions WHERE endpoint = ?1").bind(e)));
    },
  };
}

// --- HTTP API: /push/key, /push/subscribe, /push/unsubscribe ---

export async function handlePushApi(request, env, path, { originAllowed, reply }) {
  if (path === "/push/key" && request.method === "GET") {
    if (!env.VAPID_PUBLIC_KEY) return reply({ error: "push_not_configured" }, 503);
    return reply({ publicKey: env.VAPID_PUBLIC_KEY }, 200);
  }
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  // Only our site may change subscriptions.
  if (!originAllowed) return reply({ error: "forbidden" }, 403);

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return reply({ error: "too_large" }, 413);
    body = JSON.parse(text);
  } catch {
    return reply({ error: "bad_json" }, 400);
  }

  const store = createStore(env.DB);
  if (path === "/push/unsubscribe") {
    if (typeof body?.endpoint !== "string" || body.endpoint.length > MAX_ENDPOINT_LENGTH) {
      return reply({ error: "bad_endpoint" }, 400);
    }
    await store.remove(body.endpoint);
    return reply({ ok: true }, 200);
  }
  if (path === "/push/subscribe") {
    let row;
    try {
      row = validateSubscribe(body, parseGroups(env));
    } catch (err) {
      return reply({ error: "invalid", message: err.message }, 400);
    }
    // Nothing wanted: don't keep the row at all.
    if (!row.reminders && !row.alerts) await store.remove(row.endpoint);
    else await store.upsert(row, new Date().toISOString());
    return reply({ ok: true }, 200);
  }
  return reply({ error: "not_found" }, 404);
}

// --- Cron ---

async function getSchedule(env, url, fetchImpl, now) {
  const key = `schedule:${url}`;
  const cached = await env.CACHE.get(key, "json");
  if (cached && now - cached.cachedAt < SCHEDULE_FRESH_MS) return cached.schedule;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000), cf: { cacheTtl: 300 } });
    if (!res.ok) throw new Error(`schedule HTTP ${res.status}`);
    const schedule = validateSchedule(await res.json());
    await env.CACHE.put(key, JSON.stringify({ cachedAt: now.getTime(), schedule }), {
      expirationTtl: SCHEDULE_KEEP_SECONDS,
    });
    return schedule;
  } catch (err) {
    console.warn("push: schedule", err);
    return cached?.schedule ?? null; // stale beats nothing
  }
}

// Reads the feed (once per run) and returns the current alarm event for a region:
// { alert, changedAt, alertSince } — or null if we don't know yet.
// KV is written only when the state flips, so this stays far below KV's write limits.
async function getAlarm(env, region, feed, now) {
  const key = `alarm:${region}`;
  const prev = await env.CACHE.get(key, "json");
  const entry = feed?.states?.[region];
  if (!entry || typeof entry.alertnow !== "boolean") return null; // feed down: send nothing
  const alert = entry.alertnow;
  if (prev && prev.alert === alert) return prev;

  const next = {
    alert,
    changedAt: now.toISOString(),
    // On an all-clear, keep when the alert started so we can say how long it lasted.
    alertSince: alert ? now.toISOString() : prev?.alertSince ?? null,
    firstSeen: !prev, // the very first reading isn't a change: never push for it
  };
  await env.CACHE.put(key, JSON.stringify(next));
  return next;
}

async function fetchFeed(fetchImpl) {
  try {
    const res = await fetchImpl(ALARM_FEED_URL, {
      headers: { Accept: "application/json", "User-Agent": "pary-alarm-proxy/1.0 (+https://github.com/syrnikov/eSchedule)" },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Sends one message to each row. Returns endpoints by outcome.
async function deliver(rows, message, vapid, { fetchImpl, ttl }) {
  const done = [];
  const gone = [];
  await Promise.all(rows.map(async (row) => {
    try {
      const status = await sendPush(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, message, vapid, { fetchImpl, ttl },
      );
      if (status === 404 || status === 410) gone.push(row.endpoint);
      else if (status === 429 || status >= 500) { /* try again next minute */ }
      else done.push(row.endpoint); // 2xx, or a 4xx that retrying won't fix
      if (status >= 300 && status !== 404 && status !== 410) console.warn("push: status", status, new URL(row.endpoint).host);
    } catch (err) {
      console.warn("push: send failed", err?.message ?? err);
    }
  }));
  return { done, gone };
}

export async function runCron(env, now = new Date(), { fetchImpl = fetch } = {}) {
  const groups = parseGroups(env);
  const store = createStore(env.DB);
  const vapid = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
  if (!vapid.publicKey || !vapid.privateKey) return { sent: 0 };

  const { date, minutes } = kyivParts(now);
  let budget = MAX_SENDS_PER_RUN;
  let sent = 0;
  let feed; // fetched lazily, once per run

  for (const [group, cfg] of Object.entries(groups)) {
    const schedule = await getSchedule(env, cfg.schedule, fetchImpl, now);
    if (!schedule) continue;
    const todays = schedule.classes.filter((c) => c.date === date);

    // The alarm comes first: a reminder sent during an alert should say so.
    let alarm = null;
    if (cfg.region) {
      feed ??= await fetchFeed(fetchImpl);
      alarm = await getAlarm(env, cfg.region, feed, now);
    }

    // 1. "Через 5 хв — …": the next class that starts within the longest lead time.
    const next = todays.find((c) => {
      const until = toMinutes(c.start) - minutes;
      return until > 0 && until <= MAX_LEAD;
    });
    if (next && budget > 0) {
      const until = toMinutes(next.start) - minutes;
      const key = `${next.date} ${next.start}`;
      const rows = await store.dueReminders(group, until, key, budget);
      const body = STRINGS.push.reminderBody(next.type, next.teacher, next.start);
      const message = {
        title: STRINGS.push.reminderTitle(formatDuration(until), next.discipline),
        tag: `class-${key}`,
        // Tapping opens the «Приєднатися» screen. Not during an alert: shelter first.
        ...(alarm?.alert ? { body: STRINGS.push.reminderBodyAlert(body) } : { body, view: "join" }),
      };
      const { done, gone } = await deliver(rows, message, vapid, { fetchImpl, ttl: until * 60 });
      await store.mark("last_reminder", done, key);
      await store.removeMany(gone);
      budget -= rows.length;
      sent += done.length;
    }

    // 2. Air alert started or ended during a class, or just before one starts (opt-in).
    //    Same rule as the "paused" state on the screen (js/status.js).
    const live = todays.find((c) => toMinutes(c.start) <= minutes && minutes < toMinutes(c.end));
    const soon = live ? null : todays.find((c) => {
      const until = toMinutes(c.start) - minutes;
      return until > 0 && until <= SOON_MINUTES;
    });
    const fresh = alarm && !alarm.firstSeen && now - new Date(alarm.changedAt) < ALERT_PUSH_WINDOW_MS;
    if ((live || soon) && fresh && budget > 0) {
      const key = `${alarm.alert ? "alert" : "clear"}@${alarm.changedAt}`;
      const rows = await store.dueAlerts(group, key, budget);
      const lasted = !alarm.alert && alarm.alertSince
        ? Math.round((new Date(alarm.changedAt) - new Date(alarm.alertSince)) / 60_000)
        : 0;
      const message = alarm.alert
        ? {
          title: STRINGS.push.alertTitle(cfg.region),
          body: soon ? STRINGS.push.alertBodySoon(soon.start) : STRINGS.push.alertBody,
          tag: "alarm",
        }
        : {
          title: STRINGS.push.clearTitle,
          body: soon ? STRINGS.push.clearBodySoon(soon.start) : STRINGS.push.clearBody(lasted > 0 ? formatDuration(lasted) : ""),
          tag: "alarm",
          view: "join", // back to class in one tap
        };
      const { done, gone } = await deliver(rows, message, vapid, { fetchImpl, ttl: 600 });
      await store.mark("last_alert", done, key);
      await store.removeMany(gone);
      budget -= rows.length;
      sent += done.length;
    }
  }
  return { sent };
}
