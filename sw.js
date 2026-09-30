// Service worker: push notifications only.
// No fetch handler on purpose: nothing is cached, so the app can never get stuck on an old version.
// Messages come from our Worker (worker/push.js) and carry only title, body, tag and,
// for reminders and all-clears, view: "join" (which screen to open on tap).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data?.json() ?? {};
  } catch { /* not JSON: show the fallback */ }
  const text = (v) => (typeof v === "string" ? v.slice(0, 200) : "");

  event.waitUntil(self.registration.showNotification(text(msg.title) || "Пари", {
    body: text(msg.body),
    tag: text(msg.tag) || undefined,
    lang: "uk",
    icon: "icons/icon-192.png",
    data: { view: msg.view === "join" ? "join" : "" },
  }));
});

// Tap: open the app, where the meeting link lives (links never travel in pushes).
// A reminder or an all-clear opens the «Приєднатися» screen; anything else, the home screen.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const home = self.registration.scope;
  const join = event.notification.data?.view === "join";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((w) => w.url.startsWith(home));
    if (!open) return self.clients.openWindow(join ? `${home}#join` : home);
    await open.focus();
    if (join) return open.postMessage({ view: "join" }); // main.js switches the screen
    if (open.url !== home && open.navigate) await open.navigate(home).catch(() => {});
  })());
});
