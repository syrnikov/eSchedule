// The friendly bits of the main screen: greeting, day summary, tomorrow's tone, subject colour.
// PURE: no DOM, no clock, no storage. All times are Kyiv wall time.

import { STRINGS, hash, pick } from "./strings.js";
import { toMinutes, pluralize } from "./format.js";

export const ACCENT_COUNT = 6; // --accent-1 … --accent-6 in styles.css

const classes = (n) => pluralize(n, STRINGS.units.classes);

// Greeting for a Kyiv time of day. nowMin: minutes since midnight. day: ISO date (for the pool).
export function greeting(nowMin, name = "", day = "") {
  const hour = Math.floor(nowMin / 60);
  const g = STRINGS.greeting;
  if (hour >= 5 && hour < 12) return g.morning(name);
  if (hour >= 12 && hour < 18) return g.day(name);
  if (hour >= 18 && hour < 23) return g.evening(name);
  return pick(g.night, day, "night")(name);
}

// One line about today: "3 пари сьогодні, фініш о 12:35".
// Empty string when there's no schedule (the hero card already says so).
export function daySummary(status, todays, nowMin) {
  if (status.state === "nodata") return "";
  const s = STRINGS.summary;
  if (todays.length === 0) return pick(s.free, status.today, "free");

  const remaining = todays.filter((c) => toMinutes(c.end) > nowMin);
  if (remaining.length === 0) return pick(s.done(classes(todays.length)), status.today, "done");

  const end = todays[todays.length - 1].end;
  return remaining.length === todays.length
    ? s.ahead(classes(todays.length), end)
    : s.left(classes(remaining.length), end);
}

// Tomorrow card: { line, sub }. list = tomorrow's classes, in order.
export function tomorrowText(list, day) {
  const t = STRINGS.tomorrow;
  if (list.length === 0) return { line: pick(t.none, day, "tomorrow"), sub: "" };
  const start = list[0].start;
  const min = toMinutes(start);
  const tone = min < toMinutes(t.earlyBefore) ? t.early : min >= toMinutes(t.lateFrom) ? t.late : t.normal;
  return { line: t.line(start, pick(tone, day, "tomorrow")), sub: t.count(classes(list.length)) };
}

// Subject name → 1…ACCENT_COUNT. Same subject, same colour, on every device.
export const accentIndex = (discipline) => (hash(discipline ?? "") % ACCENT_COUNT) + 1;

// Whole minutes an alert lasted, or null if we don't know both ends.
export function alertMinutes(since, clearedAt) {
  if (!since || !clearedAt) return null;
  const mins = Math.round((new Date(clearedAt) - new Date(since)) / 60_000);
  return Number.isFinite(mins) && mins >= 1 ? mins : null;
}
