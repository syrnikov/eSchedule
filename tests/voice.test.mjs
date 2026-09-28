// Greeting, day summary, tomorrow's tone, subject accents, and the pick() pools.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STRINGS, pick, hash } from "../js/strings.js";
import { greeting, daySummary, tomorrowText, accentIndex, alertMinutes, ACCENT_COUNT } from "../js/voice.js";
import { cleanName, MAX_NAME_LENGTH } from "../js/profile.js";
import { computeStatus } from "../js/status.js";
import { kyivLocalToDate, kyivParts, toMinutes } from "../js/format.js";
import { validateSchedule } from "../js/schedule.js";
import { buildSchedule } from "../scraper/scrape.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../scraper/fixtures/schedule-2026-09-28_2026-10-04.json", import.meta.url), "utf8"),
);
const schedule = validateSchedule(buildSchedule(fixture, {
  now: new Date("2026-09-28T03:00:00Z"), rangeFrom: "2026-09-28", rangeTo: "2026-10-11",
}));
const CLEAR = { state: "clear", seenSince: null, clearedAt: null };

// daySummary for a Kyiv wall time, the way main.js calls it.
function summaryAt(local, sched = schedule) {
  const now = kyivLocalToDate(local);
  const status = computeStatus(now, sched, CLEAR);
  const todays = sched?.classes.filter((c) => c.date === status.today) ?? [];
  return plain(daySummary(status, todays, kyivParts(now).minutes));
}

const h = (hhmm) => toMinutes(hhmm);
// pluralize() joins number and word with a non-breaking space; compare as plain text.
const plain = (text) => text.replace(/\u00a0/g, " ");

test("pick is stable for a day and slot, and varies across days", () => {
  const pool = ["a", "b", "c", "d", "e"];
  assert.equal(pick(pool, "2026-09-28", "x"), pick(pool, "2026-09-28", "x"));
  const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
  assert.ok(new Set(days.map((d) => pick(pool, d, "x"))).size > 1);
  assert.equal(pick("plain", "2026-09-28"), "plain");
  assert.equal(hash("Теплотехніка"), hash("Теплотехніка"));
});

test("greeting follows the time of day, with and without a name", () => {
  assert.equal(greeting(h("05:00"), "Артеме"), "Доброго ранку, Артеме!");
  assert.equal(greeting(h("11:59"), ""), "Доброго ранку!");
  assert.equal(greeting(h("12:00"), "Олю"), "Добрий день, Олю!");
  assert.equal(greeting(h("17:59"), ""), "Добрий день!");
  assert.equal(greeting(h("18:00"), ""), "Добрий вечір!");
  assert.equal(greeting(h("22:59"), "Олю"), "Добрий вечір, Олю!");
  for (const t of ["23:00", "01:30", "04:59"]) {
    const nameless = greeting(h(t), "", "2026-09-28");
    const named = greeting(h(t), "Олю", "2026-09-28");
    assert.ok(STRINGS.greeting.night.some((f) => f("") === nameless), t);
    assert.ok(named.includes("Олю"), t);
    assert.ok(!nameless.includes(","), `no dangling comma: ${nameless}`);
  }
});

test("day summary: ahead, part-way, done, free, no data", () => {
  // Mon: 08:15–09:35, 09:45–11:05, 11:15–12:35
  assert.equal(summaryAt("2026-09-28T07:30"), "3 пари сьогодні, фініш о 12:35");
  assert.equal(summaryAt("2026-09-28T08:30"), "3 пари сьогодні, фініш о 12:35");
  assert.equal(summaryAt("2026-09-28T09:40"), "Ще 2 пари, фініш о 12:35");
  assert.equal(summaryAt("2026-09-28T11:20"), "Ще 1 пара, фініш о 12:35");
  const done = summaryAt("2026-09-28T13:00");
  assert.ok(STRINGS.summary.done("3 пари").map(plain).includes(done), done);
  const free = summaryAt("2026-10-03T10:00");
  assert.ok(STRINGS.summary.free.includes(free), free);
  assert.equal(summaryAt("2026-09-28T10:00", null), "");
});

test("«Сьогодні в тебе …» uses the right plural", () => {
  const units = STRINGS.units.classes;
  const title = (n) => STRINGS.today(`${n} ${units[new Intl.PluralRules("uk").select(n)]}`);
  assert.equal(plain(title(1)), "Сьогодні в тебе 1 пара");
  assert.equal(plain(title(3)), "Сьогодні в тебе 3 пари");
  assert.equal(plain(title(5)), "Сьогодні в тебе 5 пар");
});

test("tomorrow: early start gets sympathy, late start gets joy", () => {
  const cls = (start) => ({ start });
  const t = STRINGS.tomorrow;
  const tail = (start) => tomorrowText([cls(start), cls("23:00")], "2026-09-28").line.split(" — ")[1];
  assert.ok(t.early.includes(tail("08:15")));
  assert.ok(t.early.includes(tail("08:59")));
  assert.ok(t.normal.includes(tail("09:00")));
  assert.ok(t.normal.includes(tail("10:59")));
  assert.ok(t.late.includes(tail("11:00")));
  const { line, sub } = tomorrowText([cls("08:15"), cls("09:45")], "2026-09-28");
  assert.ok(line.startsWith("Завтра о 08:15 — "));
  assert.equal(plain(sub), "Усього 2 пари");
  const none = tomorrowText([], "2026-09-28");
  assert.ok(t.none.includes(none.line));
  assert.equal(none.sub, "");
});

test("accentIndex is stable and in range", () => {
  for (const c of schedule.classes) {
    const i = accentIndex(c.discipline);
    assert.ok(i >= 1 && i <= ACCENT_COUNT);
    assert.equal(accentIndex(c.discipline), i);
  }
  assert.ok(accentIndex(undefined) >= 1);
});

test("alertMinutes needs both ends and a positive duration", () => {
  const a = new Date("2026-09-28T08:20:00+03:00");
  const b = new Date("2026-09-28T08:43:00+03:00");
  assert.equal(alertMinutes(a, b), 23);
  assert.equal(alertMinutes(a.toISOString(), b.toISOString()), 23);
  assert.equal(alertMinutes(null, b), null);
  assert.equal(alertMinutes(b, a), null);
});

test("cleanName trims, collapses spaces and caps the length", () => {
  assert.equal(cleanName("  Артеме  "), "Артеме");
  assert.equal(cleanName("Анна   Марія"), "Анна Марія");
  assert.equal(cleanName(42), "");
  assert.equal(cleanName("я".repeat(100)).length, MAX_NAME_LENGTH);
});

test("copy voice: at most one emoji per string", () => {
  const emoji = /\p{Extended_Pictographic}/gu;
  const strings = [];
  const walk = (v) => {
    if (typeof v === "string") strings.push(v);
    else if (typeof v === "function") strings.push(...[].concat(v("X", "Y")).filter((x) => typeof x === "string"));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(STRINGS);
  for (const s of strings) assert.ok((s.match(emoji) ?? []).length <= 1, s);
});
