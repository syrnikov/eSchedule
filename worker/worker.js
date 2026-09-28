// Cloudflare Worker for the Пари dashboard.
//   GET  /                  proxies the air alarm feed (it sends no CORS headers, so the
//                           browser can't read it directly); CORS for our origin only, cached 60 s
//   GET  /push/key          VAPID public key
//   POST /push/subscribe    save a push subscription + preferences (see push.js)
//   POST /push/unsubscribe  forget one
//   cron, every minute      class reminders and alert pushes (see push.js)

import { handlePushApi, runCron } from "./push.js";

const FEED_URL = "https://ubilling.net.ua/aerialalerts/";
const CACHE_SECONDS = 60;
const TIMEOUT_MS = 10_000;
const USER_AGENT = "pary-alarm-proxy/1.0 (+https://github.com/syrnikov/eSchedule)";

// Built as a factory so tests can pass a fake fetch and clock.
export function createHandler({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  // In-memory copy. On *.workers.dev the Cache API is a no-op, so this is
  // what actually limits us to ~1 upstream request per minute per instance.
  let memory = null; // { body: string, at: number }

  async function getFeed(ctx) {
    if (memory && now() - memory.at < CACHE_SECONDS * 1000) return memory.body;

    // Cache API: shared across instances, but only works on a custom domain.
    const cache = typeof caches !== "undefined" ? caches.default : null;
    const cacheKey = new Request(FEED_URL);
    const hit = cache && (await cache.match(cacheKey));
    if (hit) {
      memory = { body: await hit.text(), at: now() };
      return memory.body;
    }

    const res = await fetchImpl(FEED_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
    const body = await res.text();
    const data = JSON.parse(body); // throws on garbage
    if (!data || typeof data.states !== "object") throw new Error("upstream: no states");

    memory = { body, at: now() };
    if (cache) {
      const copy = new Response(body, {
        headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_SECONDS}` },
      });
      ctx?.waitUntil?.(cache.put(cacheKey, copy));
    }
    return body;
  }

  return async function handle(request, env = {}, ctx) {
    const origin = request.headers.get("Origin");
    const allowed = String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = { Vary: "Origin" };
    if (origin && allowed.includes(origin)) cors["Access-Control-Allow-Origin"] = origin;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          "Access-Control-Allow-Methods": "GET, POST",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const path = new URL(request.url).pathname;
    if (path.startsWith("/push/")) {
      const originAllowed = Boolean(origin && allowed.includes(origin));
      try {
        return await handlePushApi(request, env, path, { originAllowed, reply: (data, status) => json(data, status, cors) });
      } catch (err) {
        console.error("push api", err);
        return json({ error: "server_error" }, 500, cors);
      }
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    try {
      const body = await getFeed(ctx);
      return new Response(body, {
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    } catch (err) {
      return json({ error: "upstream_unavailable", message: String(err?.message ?? err) }, 502, cors);
    }
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const handle = createHandler();
export default {
  fetch: handle,
  scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, new Date(event.scheduledTime)));
  },
};
