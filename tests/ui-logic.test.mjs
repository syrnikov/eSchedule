// Tests for the browser modules that don't touch the DOM: format, schedule, links, status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  kyivParts, kyivLocalToDate, formatClock, formatLongDate, formatDuration, pluralize, formatIsoDayMonth,
} from "../js/format.js";
import { validateSchedule } from "../js/schedule.js";
import { findLink } from "../js/links.js";
import { computeStatus } from "../js/status.js";
import { STRINGS } from "../js/strings.js";
import { buildSchedule } from "../scraper/scrape.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../scraper/fixtures/schedule-2026-09-28_2026-10-04.json", import.meta.url), "utf8"),
);
const schedule = validateSchedule(buildSchedule(fixture, {
  now: new Date("2026-09-28T03:00:00Z"), rangeFrom: "2026-09-28", rangeTo: "2026-10-11",
}));
const at = (local) => kyivLocalToDate(local);

// --- format.js ---

test("kyivLocalToDate respects summer and winter offsets", () => {
  assert.equal(at("2026-09-28T08:30").toISOString(), "2026-09-28T05:30:00.000Z"); // UTC+3
  assert.equal(at("2026-12-01T08:30").toISOString(), "2026-12-01T06:30:00.000Z"); // UTC+2
  assert.equal(kyivLocalToDate("nonsense"), null);
});

test("kyivParts reads Kyiv wall time regardless of the machine's timezone", () => {
  assert.deepEqual(kyivParts(at("2026-09-28T08:30")), { date: "2026-09-28", minutes: 510, seconds: 0, weekday: 1 });
});

test("Ukrainian formatting", () => {
  assert.equal(formatClock(at("2026-09-28T08:05")), "08:05");
  assert.equal(formatLongDate(at("2026-09-28T08:05")), "понеділок, 28 вересня");
  assert.equal(formatIsoDayMonth("2026-10-01"), "1 жовтня");
  assert.equal(formatDuration(34), "34 хв");
  assert.equal(formatDuration(65), "1 год 5 хв");
  assert.equal(formatDuration(120), "2 год");
  assert.equal(pluralize(1, STRINGS.units.classes), "1 пара");
  assert.equal(pluralize(3, STRINGS.units.classes), "3 пари");
  assert.equal(pluralize(5, STRINGS.units.classes), "5 пар");
  assert.equal(pluralize(21, STRINGS.units.classes), "21 пара");
});

// --- schedule.js ---

test("validateSchedule accepts scraper output and rejects broken files", () => {
  assert.equal(schedule.classes.length, 14);
  assert.throws(() => validateSchedule({ ...schedule, rangeFrom: "28.09.2026" }));
  assert.throws(() => validateSchedule({ ...schedule, classes: [{ date: "2026-09-28" }] }));
  assert.throws(() => validateSchedule(null));
});

// --- links.js ---

test("findLink prefers discipline|type, then the teacher fallback", () => {
  const cls = { discipline: "Трактори і автомобілі", type: "Практичні", teacher: "Дядюра К. О." };
  assert.equal(findLink({ "Трактори і автомобілі|Практичні": "https://a" , "@Дядюра К. О.": "https://b" }, cls), "https://a");
  assert.equal(findLink({ "Трактори і автомобілі|Лекції": "https://a", "@Дядюра К. О.": "https://b" }, cls), "https://b");
  assert.equal(findLink({}, cls), null);
  assert.equal(findLink({ "@": "https://x" }, { ...cls, teacher: "" }), null);
});

// --- status.js (basic cases; the full table incl. alarms is Phase 4) ---

const status = (local) => computeStatus(at(local), schedule);

test("status: before, during and between classes", () => {
  assert.equal(status("2026-09-28T07:00").state, "upcoming");
  assert.equal(status("2026-09-28T08:00").state, "soon");
  assert.equal(status("2026-09-28T08:00").minutesUntil, 15);

  const live = status("2026-09-28T08:30");
  assert.equal(live.state, "live");
  assert.equal(live.cls.discipline, "Іноземна мова");
  assert.equal(live.minutesLeft, 65);

  assert.equal(status("2026-09-28T09:38").state, "soon"); // 7 min to the next class
});

test("status: first class later today, and done for the day", () => {
  assert.equal(status("2026-09-30T08:00").state, "upcoming"); // Wed starts at 09:45
  const done = status("2026-09-28T13:00");
  assert.equal(done.state, "done");
  assert.equal(done.nextClass.date, "2026-09-29");
});

// The fixture week has no gap longer than 15 min, so build one.
test("status: break with a real gap", () => {
  const s = validateSchedule({
    ...schedule,
    classes: [
      { date: "2026-09-28", start: "08:15", end: "09:35", discipline: "A", type: "Лекції", room: "", teacher: "" },
      { date: "2026-09-28", start: "12:50", end: "14:10", discipline: "B", type: "Лекції", room: "", teacher: "" },
    ],
  });
  const brk = computeStatus(at("2026-09-28T10:00"), s);
  assert.equal(brk.state, "break");
  assert.equal(brk.cls.discipline, "B");
});

test("status: Wed 12:36 is soon for Кураторська година", () => {
  const s = status("2026-09-30T12:36");
  assert.equal(s.state, "soon");
  assert.equal(s.cls.discipline, "Кураторська година");
  assert.equal(findLink({}, s.cls), null); // no link → no button
});

test("status: weekend, weekday without classes, no data", () => {
  const sat = status("2026-10-03T10:00");
  assert.equal(sat.state, "weekend");
  assert.equal(sat.isWeekend, true);
  assert.equal(sat.nextClass, null); // next week isn't in the fixture
  const weekdayOff = computeStatus(at("2026-10-07T10:00"), schedule); // inside range, no classes
  assert.equal(weekdayOff.state, "weekend");
  assert.equal(weekdayOff.isWeekend, false);
  assert.equal(computeStatus(at("2026-10-12T10:00"), schedule).state, "nodata"); // past rangeTo
  assert.equal(computeStatus(at("2026-09-28T10:00"), null).state, "nodata");
});
