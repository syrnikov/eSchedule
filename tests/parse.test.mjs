import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseSchedule, toIsoDate, toTime, cleanDiscipline, audienceOf, clean,
} from "../scraper/parse.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../scraper/fixtures/schedule-2026-09-28_2026-10-04.json", import.meta.url), "utf8"),
);

// Short builder so the expected table below stays readable.
const c = (date, start, end, discipline, type, teacher, extra = {}) => ({
  date, start, end, discipline, type, room: "онлайн", teacher, audience: "group", ...extra,
});
const sub = { audience: "subgroup" };
const noRoom = { room: "", teacher: "" };

// The "Test data" table from PLAN.md.
const EXPECTED = [
  c("2026-09-28", "08:15", "09:35", "Іноземна мова", "Практичні", "Насакіна С. В."),
  c("2026-09-28", "09:45", "11:05", "Трактори і автомобілі", "Практичні", "Дядюра К. О."),
  c("2026-09-28", "11:15", "12:35", "Теплотехніка та гідравлика", "Лекції", "Уминський С. М."),
  c("2026-09-29", "08:15", "09:35", "ІТ-технології в проектуванні", "Лабораторні", "Мартинова О. Б.", sub),
  c("2026-09-29", "09:45", "11:05", "Технологія машинобудування", "Лекції", "Житков С. С."),
  c("2026-09-30", "09:45", "11:05", "Соціальна робота в громаді", "Лекції", "Варивода Ю. Ю."),
  c("2026-09-30", "11:15", "12:35", "ІТ-технології в проектуванні", "Лабораторні", "Мартинова О. Б.", sub),
  c("2026-09-30", "12:50", "14:10", "Кураторська година", "Лекції", "", noRoom),
  c("2026-09-30", "14:20", "15:40", "Технологія машинобудування", "Практичні", "Устуянов П. Д."),
  c("2026-10-01", "09:45", "11:05", "Зустріч зі стейкхолдерами", "Лекції", "", noRoom),
  c("2026-10-01", "11:15", "12:35", "Трактори і автомобілі", "Лекції", "Дядюра К. О."),
  c("2026-10-01", "12:50", "14:10", "Теплотехніка та гідравлика", "Практичні", "Макарчук В. І."),
  c("2026-10-02", "09:45", "11:05", "Сільськогосподарські машини", "Практичні", "Павлішин П. М."),
  c("2026-10-02", "11:15", "12:35", "Теплотехніка та гідравлика", "Практичні", "Макарчук В. І."),
];

test("fixture week parses to the expected 14 classes for subgroup 1б", () => {
  assert.deepEqual(parseSchedule(fixture, { subgroup: "1б" }), EXPECTED);
});

test("subgroup 1а rows are excluded", () => {
  const classes = parseSchedule(fixture, { subgroup: "1б" });
  assert.equal(classes.some((x) => x.teacher === "Наконечна О. А."), false);
});

test("asking for subgroup 1а swaps the ІТ teacher", () => {
  const it = parseSchedule(fixture, { subgroup: "1а" }).filter((x) => x.audience === "subgroup");
  assert.equal(it.length, 2);
  assert.ok(it.every((x) => x.teacher === "Наконечна О. А."));
});

test("audienceOf handles whitespace and Latin look-alikes", () => {
  assert.equal(audienceOf("Група: 208-бак-3к денне 26-27", "1б"), "group");
  assert.equal(audienceOf("  Група:208 ", "1б"), "group");
  assert.equal(audienceOf("Підгрупа: 1б", "1б"), "subgroup");
  assert.equal(audienceOf("Підгрупа:  1б ", "1б"), "subgroup");
  assert.equal(audienceOf("Пiдгрупa: 1б", "1б"), "subgroup"); // Latin i and a
  assert.equal(audienceOf("підгрупа: 1Б", "1б"), "subgroup");
  assert.equal(audienceOf("Підгрупа: 1а", "1б"), null);
  assert.equal(audienceOf("Підгрупа: 1a", "1а"), "subgroup"); // Latin a in data
  assert.equal(audienceOf("Підгрупа: 1бв", "1б"), null);
  assert.equal(audienceOf(null, "1б"), null);
});

test("dates, times and names are normalized", () => {
  assert.equal(toIsoDate("28.09.2026"), "2026-09-28");
  assert.throws(() => toIsoDate("2026-09-28"));
  assert.equal(toTime("8:15"), "08:15");
  assert.throws(() => toTime("08.15"));
  assert.equal(cleanDiscipline("  Соціальна робота в громаді_ "), "Соціальна робота в громаді");
  assert.equal(clean(null), "");
  assert.equal(clean("  Дядюра  К. О. "), "Дядюра К. О.");
});

test("output is sorted even if the API order isn't", () => {
  const reversed = { d: [...fixture.d].reverse() };
  assert.deepEqual(parseSchedule(reversed, { subgroup: "1б" }), EXPECTED);
});

test("empty range gives an empty list", () => {
  assert.deepEqual(parseSchedule({ d: [] }, { subgroup: "1б" }), []);
});

test("malformed payloads throw", () => {
  assert.throws(() => parseSchedule(null, { subgroup: "1б" }));
  assert.throws(() => parseSchedule({ d: null }, { subgroup: "1б" }));
  const badDate = { d: [{ ...fixture.d[0], full_date: "99.99" }] };
  assert.throws(() => parseSchedule(badDate, { subgroup: "1б" }), /date/);
});
