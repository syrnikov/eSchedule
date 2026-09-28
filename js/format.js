// Europe/Kyiv date/time helpers and Ukrainian formatting.
// Never uses the device timezone: everything goes through Intl with TIME_ZONE.

import { STRINGS } from "./strings.js";

export const TIME_ZONE = "Europe/Kyiv";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  weekday: "short", hourCycle: "h23",
});
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Kyiv wall clock for an instant: { date: "2026-09-28", minutes: 510, seconds, weekday: 1 }.
export function kyivParts(instant) {
  const p = Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    seconds: Number(p.second),
    weekday: WEEKDAYS[p.weekday],
  };
}

// "09:45" -> 585
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Calendar math on ISO dates (no timezone involved).
export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

// "2026-09-28T08:30" read as Kyiv wall time -> Date. Used for the ?now= debug param and tests.
export function kyivLocalToDate(local) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Kyiv offset at that moment (try twice so DST edges settle).
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const p = kyivParts(new Date(guess));
    const wall = Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10),
      Math.floor(p.minutes / 60), p.minutes % 60, p.seconds);
    guess = asUtc - (wall - guess);
  }
  return new Date(guess);
}

// --- Display formatting ---

const clockFormatter = new Intl.DateTimeFormat("uk", {
  timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const longDateFormatter = new Intl.DateTimeFormat("uk", {
  timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long",
});
const dayMonthFormatter = new Intl.DateTimeFormat("uk", {
  timeZone: TIME_ZONE, day: "numeric", month: "long",
});

export const formatClock = (instant) => clockFormatter.format(instant); // "08:30"
export const formatLongDate = (instant) => longDateFormatter.format(instant); // "понеділок, 28 вересня"
export const formatDayMonth = (instant) => dayMonthFormatter.format(instant); // "28 вересня"

// ISO date -> "28 вересня" (noon UTC is the same calendar day in Kyiv).
export const formatIsoDayMonth = (isoDate) => formatDayMonth(new Date(`${isoDate}T12:00:00Z`));

const plural = new Intl.PluralRules("uk");

// 3, STRINGS.units.classes -> "3 пари"
export function pluralize(count, forms) {
  return `${count} ${forms[plural.select(count)] ?? forms.many}`;
}

// 34 -> "34 хв", 65 -> "1 год 5 хв", 120 -> "2 год"
export function formatDuration(totalMinutes) {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts = [];
  if (h) parts.push(pluralize(h, STRINGS.units.hours));
  if (m || !h) parts.push(pluralize(m, STRINGS.units.minutes));
  return parts.join(" ");
}

// "Мартинова О. Б." -> surname and initials glued with non-breaking spaces, so a line
// never ends with a lone initial ("Мартинова О. / Б.").
export const keepName = (name) => (name ? name.replace(/ (?=\p{Lu}\.)/gu, "\u00a0") : name);

// "08:15", "09:35" -> "08:15 – 09:35" (thin-spaced en dash)
export const formatRange = (start, end) => `${start} – ${end}`;
