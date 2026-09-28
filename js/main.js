// Boot + render loop: the clock ticks every second, everything else re-renders every 15 s.

import { STRINGS, pick } from "./strings.js";
import {
  kyivParts, kyivLocalToDate, addDays, weekdayOf, toMinutes,
  formatClock, formatLongDate, formatDayMonth, formatIsoDayMonth,
  formatDuration, formatRange, pluralize,
} from "./format.js";
import { loadSchedule } from "./schedule.js";
import { loadLinks, findLink, linkKey, teacherKey } from "./links.js";
import { renderSettings } from "./settings.js";
import { computeStatus } from "./status.js";
import { startAlarmWatch } from "./alarm.js";
import { el, icon } from "./dom.js";
import { greeting, daySummary, tomorrowText, accentIndex, alertMinutes } from "./voice.js";
import { loadProfile } from "./profile.js";
import { renderWelcome } from "./welcome.js";
import { renderShareImport } from "./share-view.js";
import { SHARE_PREFIX } from "./share.js";
import {
  pushSupport, loadPushPrefs, applyPush, groupKey, wantsPush, pushCardSnoozed, snoozePushCard,
  registerServiceWorker, resyncPush,
} from "./push.js";

const RENDER_EVERY_MS = 15_000;
const RELOAD_SCHEDULE_EVERY_MS = 30 * 60_000;
const STALE_AFTER_MS = 24 * 3_600_000;

const STATUS_ICONS = {
  live: "radio_button_checked",
  paused: "warning",
  resumed: "check_circle",
  soon: "schedule",
  upcoming: "schedule",
  break: "coffee",
  done: "celebration",
  weekend: "weekend",
  nodata: "cloud_off",
};

// --- Debug params for checking states by hand ---
//   ?now=2026-09-28T08:30          fake the clock (Kyiv time)
//   ?alarm=alert|unknown|resumed   fake the alarm instead of using the real feed
const params = new URLSearchParams(location.search);
const debugStart = kyivLocalToDate(params.get("now") ?? "");
const debugAlarm = params.get("alarm");
const bootedAt = Date.now();
const now = () => (debugStart ? new Date(debugStart.getTime() + Date.now() - bootedAt) : new Date());

let schedule = null;
let loadFailed = false;
let getAlarm = () => ({ state: "unknown", seenSince: null, clearedAt: null, pending: true });

const typeIcon = (type) => STRINGS.data.typeIcons[type] ?? STRINGS.data.defaultTypeIcon;
const joinDot = (...parts) => parts.filter(Boolean).join(" · ");
const showRoom = (room) => (room && room !== STRINGS.data.onlineRoom ? room : "");

// "Завтра перша пара о 09:45" / "Наступна пара в понеділок" / "Попереду пар немає"
function nextClassText(today, nextClass) {
  if (!nextClass) return STRINGS.detail.noneAhead;
  if (nextClass.date === addDays(today, 1)) return STRINGS.detail.tomorrowFirst(nextClass.start);
  const within6Days = nextClass.date <= addDays(today, 6);
  const when = within6Days ? STRINGS.weekdayOn[weekdayOf(nextClass.date)] : formatIsoDayMonth(nextClass.date);
  return STRINGS.detail.nextOn(when);
}

// Label + detail line for the hero, from the computed status.
function describe(status) {
  const { state, cls, today } = status;
  switch (state) {
    case "paused":
      return { label: STRINGS.status.paused, detail: STRINGS.detail.paused };
    case "resumed": {
      const lasted = alertMinutes(status.alertSince, status.clearedAt);
      return {
        label: STRINGS.status.resumed,
        detail: lasted ? STRINGS.detail.alertLasted(formatDuration(lasted)) : STRINGS.detail.resumed,
      };
    }
    case "live":
      return {
        label: STRINGS.status.live,
        detail: pick(STRINGS.detail.left(formatDuration(status.minutesLeft)), today, `live:${cls.start}`),
      };
    case "soon":
      return { label: STRINGS.status.soon(status.minutesUntil), detail: pick(STRINGS.detail.soon, today, `soon:${cls.start}`) };
    case "upcoming":
      return { label: STRINGS.status.upcoming(cls.start), detail: STRINGS.detail.startsIn(formatDuration(status.minutesUntil)) };
    case "break":
      return { label: STRINGS.status.break, detail: STRINGS.detail.nextAt(cls.start) };
    case "done":
      return { label: STRINGS.status.done, detail: nextClassText(status.today, status.nextClass) };
    case "weekend":
      return {
        label: status.isWeekend ? STRINGS.status.weekend : STRINGS.status.dayOff,
        detail: nextClassText(status.today, status.nextClass),
      };
    default:
      return { label: STRINGS.status.nodata, detail: loadFailed ? STRINGS.loadError : STRINGS.detail.nodata };
  }
}

function renderHero(status) {
  const hero = document.getElementById("hero");
  const { label, detail } = describe(status);
  const { cls } = status;

  const parts = [
    el("div", { class: "status" },
      el("div", { class: "status-icon" }, icon(STATUS_ICONS[status.state] ?? "schedule", "40")),
      el("div", {},
        el("p", { class: "status-label" }, label),
        detail && el("p", { class: "status-detail" }, detail))),
  ];

  if (cls) {
    const filled = STRINGS.data.filledTypes.includes(cls.type);
    parts.push(
      el("div", { class: "class-kicker" },
        el("span", { class: `type-chip${filled ? " type-chip--filled" : ""}` }, icon(typeIcon(cls.type), "20"), cls.type)),
      el("h2", { class: "class-title" }, cls.discipline),
      el("p", { class: "class-meta" }, joinDot(cls.teacher, showRoom(cls.room))),
      el("div", { class: "timing" }, el("span", {}, formatRange(cls.start, cls.end))),
    );
    if (status.state === "live" || status.state === "resumed") {
      const fill = el("div", { class: "progress-fill" });
      fill.style.transform = `scaleX(${status.progress.toFixed(4)})`;
      parts.push(el("div", { class: "progress", "aria-hidden": "true" }, fill));
    }

    const url = findLink(loadLinks(), cls);
    // During an alert the screen says "pause": shelter first, so joining is secondary.
    const joinClass = status.state === "paused" ? "btn-join btn-join--secondary" : "btn-join";
    parts.push(url
      ? el("a", { class: joinClass, href: url, target: "_blank", rel: "noopener noreferrer" },
        icon("videocam"), STRINGS.join)
      : el("div", { class: "no-link" },
        icon("link_off", "20"), el("span", {}, STRINGS.noLink),
        // Teacher links are the main way to add links; classes without a teacher use their own.
        el("a", { href: `#settings:${encodeURIComponent(cls.teacher ? teacherKey(cls.teacher) : linkKey(cls))}` },
          STRINGS.addLink)));
  }

  // Small alarm notes. "paused" already says it all.
  if (status.alarm === "alert" && status.state !== "paused") {
    parts.push(el("p", { class: "alarm-note alarm-note--active" }, icon("warning", "20"), STRINGS.alarm.active));
  } else if (status.alarm === "unknown" && !status.alarmPending) {
    parts.push(el("p", { class: "alarm-note" }, STRINGS.alarm.unknown));
  }

  hero.dataset.state = status.state;
  if (cls) hero.dataset.accent = accentIndex(cls.discipline);
  else delete hero.dataset.accent;
  hero.replaceChildren(...parts);
}

function renderToday(status) {
  const card = document.getElementById("today");
  const todays = schedule?.classes.filter((c) => c.date === status.today) ?? [];
  card.hidden = todays.length === 0;
  if (card.hidden) return;

  const nowMin = kyivParts(now()).minutes;
  const rows = todays.map((c) => {
    const past = toMinutes(c.end) <= nowMin;
    const live = !past && toMinutes(c.start) <= nowMin;
    return el("li", { class: `row${past ? " is-past" : ""}${live ? " is-now" : ""}` },
      el("div", { class: "row-time" }, c.start, el("small", {}, c.end)),
      el("div", {},
        el("div", { class: "row-title" }, icon(typeIcon(c.type), "20"), el("span", {}, c.discipline)),
        el("div", { class: "row-sub" }, joinDot(c.type, c.teacher, showRoom(c.room)))),
      live ? el("span", { class: "badge" }, STRINGS.nowBadge) : el("span"));
  });

  const title = STRINGS.today(pluralize(todays.length, STRINGS.units.classes));
  card.replaceChildren(el("h3", { class: "card-title" }, title), el("ul", { class: "rows" }, rows));
}

function renderTomorrow(status) {
  const card = document.getElementById("tomorrow");
  const tomorrow = addDays(status.today, 1);
  card.hidden = !schedule || tomorrow > schedule.rangeTo;
  if (card.hidden) return;

  const list = schedule.classes.filter((c) => c.date === tomorrow);
  const { line, sub } = tomorrowText(list, status.today);
  card.replaceChildren(el("div", { class: "tomorrow" },
    el("p", { class: "tomorrow-line" }, line),
    sub && el("p", { class: "tomorrow-sub" }, sub)));
}

// "Нагадувати про пари?": offered once, in context, on the home screen. The permission
// prompt only appears after the student taps «Увімкнути» here (or the switch in settings).
// Hidden during an alert: shelter first.
let pushCardBusy = false;
function renderPushCard(status) {
  const card = document.getElementById("push-card");
  if (pushCardBusy) return;
  const support = schedule ? pushSupport() : "unsupported";
  const show = (support === "ok" || support === "ios-install") &&
    !wantsPush(loadPushPrefs()) && !pushCardSnoozed() && status.state !== "paused";
  card.hidden = !show;
  if (!show || card.dataset.support === support) return; // already built
  card.dataset.support = support;

  const P = STRINGS.pushCard;
  const later = el("button", { type: "button", class: "btn btn--text" }, P.later);
  later.addEventListener("click", () => { snoozePushCard(); card.hidden = true; });

  let action;
  if (support === "ios-install") {
    action = el("a", { class: "btn btn--primary", href: "#settings:push" }, P.how);
  } else {
    action = el("button", { type: "button", class: "btn btn--primary" }, icon("notifications"), P.enable);
    action.addEventListener("click", async () => {
      pushCardBusy = true;
      action.disabled = true;
      try {
        const result = await applyPush({ reminders: true, lead: 5, alerts: false }, groupKey(schedule));
        if (result === "on") {
          card.replaceChildren(el("p", { class: "push-card-done" }, STRINGS.settingsView.pushOn));
          setTimeout(() => { card.hidden = true; pushCardBusy = false; delete card.dataset.support; }, 4000);
          return;
        }
        card.hidden = true; // denied: don't ask again here
      } catch (err) {
        console.warn(err);
        card.querySelector(".push-card-body").textContent = STRINGS.settingsView.pushError;
      }
      action.disabled = false;
      pushCardBusy = false;
    });
  }

  card.replaceChildren(
    el("p", { class: "push-card-title" }, P.title),
    el("p", { class: "push-card-body" }, support === "ios-install" ? P.iosBody : P.body),
    el("div", { class: "push-card-actions" }, action, later));
}

function renderFooter() {
  const foot = document.getElementById("footer");
  if (!schedule) return foot.replaceChildren();
  const fetched = new Date(schedule.fetchedAt);
  const stale = now() - fetched > STALE_AFTER_MS;
  const parts = [el("p", {}, STRINGS.updatedAt(formatDayMonth(fetched), formatClock(fetched)))];
  if (stale) parts.push(el("p", {}, el("span", { class: "stale" }, icon("history", "20"), STRINGS.stale)));
  foot.replaceChildren(...parts);
}

// Small date + time line above the greeting. The time is still handy, just not the hero.
function renderClock() {
  const t = now();
  const text = joinDot(formatLongDate(t), formatClock(t));
  const dateEl = document.getElementById("date");
  if (dateEl.textContent !== text) dateEl.textContent = text;
}

const setText = (id, text) => {
  const node = document.getElementById(id);
  if (node.textContent !== text) node.textContent = text;
  node.hidden = !text;
};

function renderHeader(status) {
  const nowMin = kyivParts(now()).minutes;
  const todays = schedule?.classes.filter((c) => c.date === status.today) ?? [];
  setText("greeting", greeting(nowMin, loadProfile().name, status.today));
  setText("day-summary", daySummary(status, todays, nowMin));
}

function currentAlarm() {
  const t = now();
  if (debugAlarm === "alert") return { state: "alert", seenSince: t, clearedAt: null };
  if (debugAlarm === "unknown") return { state: "unknown", seenSince: null, clearedAt: null };
  if (debugAlarm === "resumed") {
    // A 23-minute alert that ended when the page opened.
    const clearedAt = new Date(debugStart ?? bootedAt);
    return { state: "clear", seenSince: null, clearedAt, lastAlertSince: new Date(clearedAt - 23 * 60_000) };
  }
  if (debugAlarm === "clear") return { state: "clear", seenSince: null, clearedAt: null };
  return getAlarm();
}

let lastMinute = -1;
function render() {
  const alarm = currentAlarm();
  // alarmPending: first poll hasn't answered yet, so don't flash "unknown".
  const status = { ...computeStatus(now(), schedule, alarm), alarmPending: Boolean(alarm.pending) };
  renderHeader(status);
  renderHero(status);
  announce(status);
  renderToday(status);
  renderPushCard(status);
  renderTomorrow(status);
  renderFooter();
  lastMinute = kyivParts(now()).minutes;
}

async function refreshSchedule() {
  try {
    schedule = await loadSchedule();
    loadFailed = false;
    resyncPush(groupKey(schedule));
  } catch (err) {
    console.error(err);
    loadFailed = !schedule; // keep showing the last good copy if we have one
  }
  render();
  // Settings opened before the schedule arrived: fill in the list now.
  if (settingsOpen() && settingsEmpty && schedule) route();
}

// --- Routing: "#settings" or "#settings:<link key>" opens settings, anything else the main screen.
// On first launch the main screen waits behind the welcome card. ---
let settingsEmpty = false;
let welcomeDone = false; // for this session, in case storage is blocked
// "#share=…" from a groupmate: held here and wiped from the address bar right away, so the
// links don't linger in history or get re-shared by accident.
let pendingShare = null;
const settingsOpen = () => location.hash.startsWith("#settings");

// Tab title and screen reader announcement: only when the status actually changes,
// not on every 15 s re-render.
let lastAnnounced = "";
function announce(status) {
  const { label } = describe(status);
  const text = status.cls ? `${label} · ${status.cls.discipline}` : label;
  if (!settingsOpen()) document.title = text;
  if (text !== lastAnnounced) {
    lastAnnounced = text;
    document.getElementById("announcer").textContent = text;
  }
}

function route() {
  if (location.hash.startsWith(SHARE_PREFIX)) {
    pendingShare = location.hash.slice(SHARE_PREFIX.length);
    history.replaceState(null, "", location.pathname + location.search);
  }
  const open = settingsOpen();
  // A shared link is why they opened the app, so it comes before the welcome card.
  const share = !open && pendingShare !== null;
  const welcome = !open && !share && !welcomeDone && !loadProfile().onboarded;
  document.getElementById("main-view").hidden = open || share || welcome;
  document.getElementById("settings-view").hidden = !open;
  document.getElementById("share-view").hidden = !share;
  document.getElementById("welcome-view").hidden = !welcome;
  if (share) {
    document.title = `${STRINGS.shareImport.title} · ${STRINGS.appTitle}`;
    renderShareImport(document.getElementById("share-view"), pendingShare, () => {
      pendingShare = null;
      route();
    });
  } else if (welcome) {
    document.title = STRINGS.appTitle;
    renderWelcome(document.getElementById("welcome-view"), () => {
      welcomeDone = true;
      route();
    });
  } else if (open) {
    const [, rawKey] = location.hash.split(/:(.*)/);
    const focusKey = rawKey ? decodeURIComponent(rawKey) : null;
    settingsEmpty = !schedule;
    document.title = `${STRINGS.settingsView.title} · ${STRINGS.appTitle}`;
    renderSettings(document.getElementById("settings-view"), schedule, { focusKey });
  } else {
    render(); // links may have changed
    window.scrollTo(0, 0);
  }
}

// Icons stay invisible until their font is in, so ligature names ("schedule") never flash.
// Checked on every font load, not once: a single early check that missed the font used to
// leave icons hidden for good (seen on iOS home-screen apps).
function watchIconFont() {
  const root = document.documentElement;
  const fonts = document.fonts;
  if (!fonts) return root.classList.add("icons-ready"); // very old browser: better text than nothing
  const mark = () => {
    let ready = false;
    fonts.forEach((f) => {
      if (f.family.replace(/["']/g, "") === "Material Symbols Rounded" && f.status === "loaded") ready = true;
    });
    if (ready) {
      root.classList.add("icons-ready");
      fonts.removeEventListener?.("loadingdone", mark);
    }
  };
  fonts.addEventListener?.("loadingdone", mark);
  fonts.load('24px "Material Symbols Rounded"', "schedule").then(mark, () => {});
  fonts.ready.then(mark, () => {});
}

function boot() {
  document.title = STRINGS.appTitle;
  document.getElementById("app-heading").textContent = STRINGS.appTitle;
  document.getElementById("settings-btn").setAttribute("aria-label", STRINGS.settings);
  watchIconFont();
  registerServiceWorker();
  if (!debugAlarm) getAlarm = startAlarmWatch(() => render());

  renderClock();
  route();
  refreshSchedule();
  window.addEventListener("hashchange", route);

  setInterval(() => {
    renderClock();
    // Re-render right on the minute change too, so "Ще 34 хв" never lags.
    if (kyivParts(now()).minutes !== lastMinute) render();
  }, 1000);
  setInterval(render, RENDER_EVERY_MS);
  setInterval(refreshSchedule, RELOAD_SCHEDULE_EVERY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { renderClock(); render(); }
  });
}

boot();
