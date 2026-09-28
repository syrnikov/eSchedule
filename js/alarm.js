// Air alarm: polls our Cloudflare Worker and tracks the state client-side.
// Output shape (what computeStatus expects):
//   { state: "alert" | "clear" | "unknown", seenSince: Date|null, clearedAt: Date|null,
//     lastAlertSince: Date|null }  // when the last finished alert started (for "Тривога тривала 23 хв")

import { ALARM_WORKER_URL, ALARM_REGION } from "./config.js";

const POLL_MS = 60_000;
const BACKOFF_MS = 5 * 60_000;
const FAILURES_BEFORE_BACKOFF = 3;
const MIN_GAP_MS = 10_000; // don't re-poll on quick tab switches
const TIMEOUT_MS = 15_000;
const STORAGE_KEY = "pary.alarm.v1";
const RESTORE_MAX_AGE_MS = 10 * 60_000;

export const INITIAL = {
  state: "unknown", seenSince: null, clearedAt: null, lastAlertSince: null, failures: 0, pending: true,
};

// Feed JSON -> true (alert) / false (clear). Throws if the region is missing.
export function parseFeed(data, region = ALARM_REGION) {
  const entry = data?.states?.[region];
  if (!entry || typeof entry.alertnow !== "boolean") throw new Error(`alarm: no "${region}" in feed`);
  return entry.alertnow;
}

// PURE: previous state + one poll result -> next state.
// observation = { ok: true, alert: boolean } | { ok: false }
export function nextAlarmState(prev, observation, now) {
  if (!observation.ok) {
    // Feed unreachable. If we last saw an alert, keep saying so (err on the side
    // of caution); otherwise we genuinely don't know.
    const state = prev.state === "alert" ? "alert" : "unknown";
    return { ...prev, state, failures: prev.failures + 1, pending: false };
  }
  if (observation.alert) {
    // The feed's "changed" time is unreliable, so "since" is when WE first saw it.
    const seenSince = prev.state === "alert" && prev.seenSince ? prev.seenSince : now;
    return {
      state: "alert", seenSince, clearedAt: prev.clearedAt, lastAlertSince: prev.lastAlertSince ?? null,
      failures: 0, pending: false,
    };
  }
  // Clear. We only know when it ended if we saw it active before.
  const justEnded = prev.state === "alert";
  const clearedAt = justEnded ? now : prev.clearedAt;
  const lastAlertSince = justEnded ? prev.seenSince : prev.lastAlertSince ?? null;
  return { state: "clear", seenSince: null, clearedAt, lastAlertSince, failures: 0, pending: false };
}

// --- Browser side (not unit-tested: network, timers, storage) ---

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || Date.now() - saved.savedAt > RESTORE_MAX_AGE_MS) return INITIAL;
    return {
      ...INITIAL,
      seenSince: saved.seenSince ? new Date(saved.seenSince) : null,
      clearedAt: saved.clearedAt ? new Date(saved.clearedAt) : null,
      lastAlertSince: saved.lastAlertSince ? new Date(saved.lastAlertSince) : null,
      // Keep "unknown" until the first poll confirms; only the timestamps carry over.
      state: saved.state === "alert" ? "alert" : "unknown",
    };
  } catch {
    return INITIAL;
  }
}

function save(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      state: s.state, seenSince: s.seenSince, clearedAt: s.clearedAt, lastAlertSince: s.lastAlertSince,
      savedAt: Date.now(),
    }));
  } catch { /* storage blocked: fine, we just lose the timestamps on reload */ }
}

async function poll() {
  try {
    const res = await fetch(ALARM_WORKER_URL, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`alarm: HTTP ${res.status}`);
    return { ok: true, alert: parseFeed(await res.json()) };
  } catch (err) {
    console.warn(err);
    return { ok: false };
  }
}

// Starts polling; calls onChange(state) after every poll. Returns a getter.
export function startAlarmWatch(onChange) {
  let current = restore();
  let lastPollAt = 0;
  let timer = null;

  if (!ALARM_WORKER_URL) {
    current = { ...INITIAL, pending: false }; // not configured: honestly unknown
    return () => current;
  }

  async function tick() {
    clearTimeout(timer);
    lastPollAt = Date.now();
    current = nextAlarmState(current, await poll(), new Date());
    save(current);
    onChange(current);
    schedule();
  }

  function schedule() {
    const delay = current.failures >= FAILURES_BEFORE_BACKOFF ? BACKOFF_MS : POLL_MS;
    timer = setTimeout(() => (document.hidden ? schedule() : tick()), delay);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastPollAt > MIN_GAP_MS) tick();
  });

  tick();
  return () => current;
}
