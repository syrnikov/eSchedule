// Tests for the browser modules that don't touch the DOM: format, schedule, links.
// status.js has its own file: status.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  kyivParts, kyivLocalToDate, formatClock, formatLongDate, formatDuration, pluralize, formatIsoDayMonth, keepName,
} from "../js/format.js";
import { validateSchedule } from "../js/schedule.js";
import { findLink } from "../js/links.js";
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

test("keepName glues initials to the surname, leaves other names alone", () => {
  assert.equal(keepName("Мартинова О. Б."), "Мартинова\u00a0О.\u00a0Б.");
  assert.equal(keepName("Іван Петренко"), "Іван Петренко");
  assert.equal(keepName(""), "");
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
