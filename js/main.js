// Boot + render loop: the clock ticks every second, everything else re-renders every 15 s.

import { STRINGS } from "./strings.js";
import {
  kyivParts, kyivLocalToDate, addDays, weekdayOf, toMinutes,
  formatClock, formatLongDate, formatDayMonth, formatIsoDayMonth,
  formatDuration, formatRange, pluralize,
} from "./format.js";
import { loadSchedule } from "./schedule.js";
import { loadLinks, findLink, linkKey } from "./links.js";
import { renderSettings } from "./settings.js";
import { computeStatus } from "./status.js";
import { startAlarmWatch } from "./alarm.js";
import { el, icon } from "./dom.js";

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
  const { state, cls } = status;
  switch (state) {
    case "paused":
      return { label: STRINGS.status.paused, detail: STRINGS.detail.paused };
    case "resumed":
      return { label: STRINGS.status.resumed, detail: STRINGS.detail.resumed };
    case "live":
      return { label: STRINGS.status.live, detail: STRINGS.detail.left(formatDuration(status.minutesLeft)) };
    case "soon":
      return { label: STRINGS.status.soon(status.minutesUntil), detail: "" };
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
    parts.push(
      el("h2", { class: "class-title" }, cls.discipline),
      el("p", { class: "class-meta" }, joinDot(cls.type, cls.teacher, showRoom(cls.room))),
      el("div", { class: "timing" }, el("span", {}, formatRange(cls.start, cls.end))),
    );
    if (status.state === "live" || status.state === "resumed") {
      const fill = el("div", { class: "progress-fill" });
      fill.style.transform = `scaleX(${status.progress.toFixed(4)})`;
      parts.push(el("div", { class: "progress", "aria-hidden": "true" }, fill));
    }

    const url = findLink(loadLinks(), cls);
    parts.push(url
      ? el("a", { class: "btn-join", href: url, target: "_blank", rel: "noopener noreferrer" },
        icon("videocam"), STRINGS.join)
      : el("div", { class: "no-link" },
        icon("link_off", "20"), el("span", {}, STRINGS.noLink),
        el("a", { href: `#settings:${encodeURIComponent(linkKey(cls))}` }, STRINGS.addLink)));
  }

  // Small alarm notes. "paused" already says it all.
  if (status.alarm === "alert" && status.state !== "paused") {
    parts.push(el("p", { class: "alarm-note alarm-note--active" }, icon("warning", "20"), STRINGS.alarm.active));
  } else if (status.alarm === "unknown" && !status.alarmPending) {
    parts.push(el("p", { class: "alarm-note" }, STRINGS.alarm.unknown));
  }

  hero.dataset.state = status.state;
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

  card.replaceChildren(el("h3", { class: "card-title" }, STRINGS.today), el("ul", { class: "rows" }, rows));
}

function renderTomorrow(status) {
  const card = document.getElementById("tomorrow");
  const tomorrow = addDays(status.today, 1);
  card.hidden = !schedule || tomorrow > schedule.rangeTo;
  if (card.hidden) return;

  const list = schedule.classes.filter((c) => c.date === tomorrow);
  const summary = list.length
    ? STRINGS.tomorrowSummary(list[0].start, pluralize(list.length, STRINGS.units.classes))
    : STRINGS.tomorrowNone;
  card.replaceChildren(el("div", { class: "tomorrow" },
    el("span", { class: "tomorrow-title" }, STRINGS.tomorrow),
    el("span", { class: "tomorrow-summary" }, summary)));
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

function renderClock() {
  const t = now();
  const clock = formatClock(t);
  const clockEl = document.getElementById("clock");
  if (clockEl.textContent !== clock) clockEl.textContent = clock;
  const date = formatLongDate(t);
  const dateEl = document.getElementById("date");
  if (dateEl.textContent !== date) dateEl.textContent = date;
}

function currentAlarm() {
  const t = now();
  if (debugAlarm === "alert") return { state: "alert", seenSince: t, clearedAt: null };
  if (debugAlarm === "unknown") return { state: "unknown", seenSince: null, clearedAt: null };
  if (debugAlarm === "resumed") return { state: "clear", seenSince: null, clearedAt: new Date(debugStart ?? bootedAt) };
  if (debugAlarm === "clear") return { state: "clear", seenSince: null, clearedAt: null };
  return getAlarm();
}

let lastMinute = -1;
function render() {
  const alarm = currentAlarm();
  // alarmPending: first poll hasn't answered yet, so don't flash "unknown".
  const status = { ...computeStatus(now(), schedule, alarm), alarmPending: Boolean(alarm.pending) };
  renderHero(status);
  renderToday(status);
  renderTomorrow(status);
  renderFooter();
  lastMinute = kyivParts(now()).minutes;
}

async function refreshSchedule() {
  try {
    schedule = await loadSchedule();
    loadFailed = false;
  } catch (err) {
    console.error(err);
    loadFailed = !schedule; // keep showing the last good copy if we have one
  }
  render();
  // Settings opened before the schedule arrived: fill in the list now.
  if (settingsOpen() && settingsEmpty && schedule) route();
}

// --- Routing: "#settings" or "#settings:<link key>" opens settings, anything else the main screen ---
let settingsEmpty = false;
const settingsOpen = () => location.hash.startsWith("#settings");

function route() {
  const open = settingsOpen();
  document.getElementById("main-view").hidden = open;
  document.getElementById("settings-view").hidden = !open;
  if (open) {
    const [, rawKey] = location.hash.split(/:(.*)/);
    const focusKey = rawKey ? decodeURIComponent(rawKey) : null;
    settingsEmpty = !schedule;
    renderSettings(document.getElementById("settings-view"), schedule, { focusKey });
  } else {
    render(); // links may have changed
    window.scrollTo(0, 0);
  }
}

function watchIconFont() {
  document.fonts?.load('24px "Material Symbols Rounded"', "schedule")
    .then((faces) => { if (faces.length) document.documentElement.classList.add("icons-ready"); })
    .catch(() => { /* icons stay hidden, text still works */ });
}

function boot() {
  document.title = STRINGS.appTitle;
  document.getElementById("settings-btn").setAttribute("aria-label", STRINGS.settings);
  watchIconFont();
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
