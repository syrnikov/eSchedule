// Tests for the pure parts of the browser modules: format, schedule, links, onboarding, days, join.
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
import { onboardingPages } from "../js/onboarding.js";
import { daysAhead } from "../js/days-view.js";
import { joinTarget } from "../js/join-view.js";
import { shouldShowNews } from "../js/profile.js";
import { computeStatus } from "../js/status.js";

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

// --- onboarding.js ---

test("onboarding pages: who sees what, in which order", () => {
  const fresh = { links: false, onboarded: false, ios: false, standalone: false, support: "ok", wants: false };
  // Android, first launch.
  assert.deepEqual(onboardingPages(fresh), ["welcome", "name", "reminders"]);
  // …from a link in the group chat: the links come first.
  assert.deepEqual(onboardingPages({ ...fresh, links: true }), ["links", "welcome", "name", "reminders"]);
  // iPhone browser tab: install before anything personal; no reminders there.
  assert.deepEqual(
    onboardingPages({ ...fresh, links: true, ios: true, support: "ios-install" }),
    ["links", "welcome", "install", "name"],
  );
  // iPhone, opened from the home screen.
  assert.deepEqual(onboardingPages({ ...fresh, ios: true, standalone: true }), ["welcome", "name", "reminders"]);
  // Reminders already on, blocked or impossible: not asked.
  assert.deepEqual(onboardingPages({ ...fresh, wants: true }), ["welcome", "name"]);
  assert.deepEqual(onboardingPages({ ...fresh, support: "denied" }), ["welcome", "name"]);
  // A student who already uses the app only gets the links, or nothing at all.
  assert.deepEqual(onboardingPages({ ...fresh, onboarded: true, links: true }), ["links"]);
  assert.deepEqual(onboardingPages({ ...fresh, onboarded: true }), []);
});

test("«Що нового» is for students who were already here", () => {
  assert.equal(shouldShowNews({ onboarded: true, newsSeen: 0 }, 1), true);
  assert.equal(shouldShowNews({ onboarded: true, newsSeen: 1 }, 1), false);
  assert.equal(shouldShowNews({ onboarded: false, newsSeen: 0 }, 1), false);
  assert.equal(shouldShowNews({ onboarded: true, newsSeen: Infinity }, 1), false); // storage blocked
});

// --- days-view.js ---

test("daysAhead: from tomorrow to the end of the schedule, free weekdays kept, empty weekends dropped", () => {
  const days = daysAhead(schedule, "2026-09-28");
  assert.equal(days[0].date, "2026-09-29");
  assert.deepEqual(days[0].classes.map((c) => c.start), ["08:15", "09:45"]);
  assert.deepEqual(days.slice(0, 5).map((d) => d.date),
    ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05"]); // no Sat 3rd, Sun 4th
  assert.equal(days.at(-1).date, "2026-10-09"); // rangeTo is Sun 11th
  assert.deepEqual(days.find((d) => d.date === "2026-10-05").classes, []); // beyond the fixture week
  assert.deepEqual(daysAhead(schedule, "2026-10-11"), []);
  assert.deepEqual(daysAhead(null, "2026-09-28"), []);
});

// --- join-view.js ---

test("joinTarget: a class to join, except during an alert or when there is none", () => {
  const status = (local, alarm) => computeStatus(at(local), schedule, alarm);
  assert.equal(joinTarget(status("2026-09-28T08:30")).discipline, "Іноземна мова"); // live
  assert.equal(joinTarget(status("2026-09-28T08:10")).discipline, "Іноземна мова"); // soon
  assert.equal(joinTarget(status("2026-09-28T08:30", { state: "alert", seenSince: null, clearedAt: null })), null);
  assert.equal(joinTarget(status("2026-09-28T13:00")), null); // done for today
  assert.equal(joinTarget(null), null);
});
