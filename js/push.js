// Push reminders, browser side: support detection, subscribe/unsubscribe, preferences.
// What goes to the Worker: the push subscription, the group ("group|subgroup") and the
// preferences. Never names, never meeting links.

import { PUSH_WORKER_URL } from "./config.js";

const PREFS_KEY = "pary.push.v1";
const CARD_KEY = "pary.pushcard.v1";
const CARD_SNOOZE_MS = 30 * 86_400_000; // «Не зараз» hides the home card for a month
const RESYNC_MS = 86_400_000;
const TIMEOUT_MS = 15_000;

export const LEADS = [5, 10, 15];
export const DEFAULT_PREFS = { reminders: false, lead: 5, alerts: false };

// --- Pure helpers (tested) ---

// "iPhone Safari, not added to the home screen" is the one case where push can't work yet
// but a friendly instruction can fix it. iPadOS reports itself as a Mac with touch.
export function isIos({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  return /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

// "ok" | "ios-install" | "unsupported" | "denied"
export function detectSupport({ ios, standalone, hasPush, permission }) {
  if (ios && !standalone) return "ios-install";
  if (!hasPush) return "unsupported";
  if (permission === "denied") return "denied";
  return "ok";
}

export const groupKey = (schedule) => (schedule?.group ? `${schedule.group}|${schedule.subgroup ?? ""}` : null);

export function cleanPrefs(p) {
  return {
    reminders: p?.reminders === true,
    lead: LEADS.includes(p?.lead) ? p.lead : DEFAULT_PREFS.lead,
    alerts: p?.alerts === true,
  };
}

export const wantsPush = (p) => p.reminders || p.alerts;

// VAPID public key (base64url) -> bytes for pushManager.subscribe.
export function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// --- Browser side ---

// Opened from the home screen (installed), not in a browser tab.
export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export function pushSupport() {
  return detectSupport({
    ios: isIos(navigator),
    standalone: isStandalone(),
    hasPush: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "default",
  });
}

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function loadPushPrefs() {
  const saved = readJson(PREFS_KEY);
  return { ...cleanPrefs(saved), syncedAt: saved?.syncedAt ?? 0, endpoint: saved?.endpoint ?? "" };
}

// Home card: hidden for a month after «Не зараз».
export const pushCardSnoozed = () => Date.now() - (readJson(CARD_KEY)?.at ?? 0) < CARD_SNOOZE_MS;
export const snoozePushCard = () => writeJson(CARD_KEY, { at: Date.now() });

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((err) => console.warn(err));
}

async function api(path, body) {
  const res = await fetch(`${PUSH_WORKER_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`push: HTTP ${res.status} on ${path}`);
  return res.json();
}

async function registration() {
  registerServiceWorker();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("push: no service worker")), TIMEOUT_MS));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function subscribeAndSave(reg, prefs, group) {
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api("/push/key");
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  }
  await api("/push/subscribe", { subscription: sub.toJSON(), group, prefs: cleanPrefs(prefs) });
  writeJson(PREFS_KEY, { ...cleanPrefs(prefs), endpoint: sub.endpoint, syncedAt: Date.now() });
}

// Saves new preferences: subscribes (asking permission if needed) or unsubscribes.
// Call it from a tap: browsers only show the permission prompt in response to one.
// Returns "on" | "off" | "denied". Throws on network/server problems.
export async function applyPush(prefs, group) {
  const next = cleanPrefs(prefs);
  if (wantsPush(next)) {
    // Ask first, before any await, so the tap still counts as the user's gesture.
    if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") {
      return "denied";
    }
    if (!group) throw new Error("push: no group");
    await subscribeAndSave(await registration(), next, group);
    return "on";
  }

  const reg = await registration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api("/push/unsubscribe", { endpoint: sub.endpoint }).catch((err) => console.warn(err));
    await sub.unsubscribe().catch(() => {});
  }
  writeJson(PREFS_KEY, { ...next, endpoint: "", syncedAt: Date.now() });
  return "off";
}

// On app start: keep the server's copy fresh (once a day), and quietly re-subscribe if the
// browser rotated or dropped the subscription. Never prompts.
export async function resyncPush(group) {
  const prefs = loadPushPrefs();
  if (!group || !wantsPush(prefs) || pushSupport() !== "ok" || Notification.permission !== "granted") return;
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    const stale = Date.now() - prefs.syncedAt > RESYNC_MS;
    if (!sub || sub.endpoint !== prefs.endpoint || stale) await subscribeAndSave(reg, prefs, group);
  } catch (err) {
    console.warn(err);
  }
}
