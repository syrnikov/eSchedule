import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isValidUrl, sanitizeLinks, collectPairs, collectTeachers, parseImport, exportJson, setLink, findLink,
} from "../js/links.js";
import { buildSchedule } from "../scraper/scrape.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../scraper/fixtures/schedule-2026-09-28_2026-10-04.json", import.meta.url), "utf8"),
);
const { classes } = buildSchedule(fixture, {
  now: new Date("2026-09-28T03:00:00Z"), rangeFrom: "2026-09-28", rangeTo: "2026-10-11",
});

test("isValidUrl: https only, must parse", () => {
  assert.equal(isValidUrl("https://zoom.us/j/123?pwd=abc"), true);
  assert.equal(isValidUrl("https://meet.google.com/abc-defg-hij"), true);
  assert.equal(isValidUrl("http://zoom.us/j/123"), false);
  assert.equal(isValidUrl("zoom.us/j/123"), false);
  assert.equal(isValidUrl("javascript:alert(1)"), false);
  assert.equal(isValidUrl("https://"), false);
  assert.equal(isValidUrl(""), false);
  assert.equal(isValidUrl(null), false);
  assert.equal(isValidUrl("https://x.com/" + "a".repeat(3000)), false);
});

test("sanitizeLinks drops invalid entries and trims", () => {
  assert.deepEqual(sanitizeLinks({
    "A|Лекції": " https://a.example ",
    "B|Лекції": "http://insecure.example",
    "C|Лекції": 42,
    "  ": "https://blank-key.example",
    "@Дядюра К. О.": "https://d.example",
  }), { "A|Лекції": "https://a.example", "@Дядюра К. О.": "https://d.example" });
  assert.deepEqual(sanitizeLinks(null), {});
  assert.deepEqual(sanitizeLinks(["https://x.example"]), {});
});

test("collectPairs: unique discipline+type with teachers, sorted", () => {
  const pairs = collectPairs(classes);
  assert.equal(pairs.length, 12); // unique discipline+type pairs in the fixture week
  const tractors = pairs.filter((p) => p.discipline === "Трактори і автомобілі");
  assert.deepEqual(tractors.map((p) => p.type), ["Лекції", "Практичні"]);
  const heat = pairs.find((p) => p.key === "Теплотехніка та гідравлика|Практичні");
  assert.deepEqual(heat.teachers, ["Макарчук В. І."]);
  const curator = pairs.find((p) => p.discipline === "Кураторська година");
  assert.deepEqual(curator.teachers, []); // no teacher → no context line
  // Sorted by discipline (Ukrainian collation)
  const names = pairs.map((p) => p.discipline);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "uk")));
});

test("collectTeachers: unique, non-empty, with their disciplines", () => {
  const teachers = collectTeachers(classes);
  assert.ok(teachers.every((t) => t.teacher && t.key === `@${t.teacher}`));
  const d = teachers.find((t) => t.teacher === "Дядюра К. О.");
  assert.deepEqual(d.disciplines, ["Трактори і автомобілі"]);
  assert.equal(teachers.some((t) => t.teacher === "Наконечна О. А."), false); // 1а only
});

test("parseImport accepts exports and rejects junk", () => {
  const links = { "A|Лекції": "https://a.example", "@B": "https://b.example" };
  assert.deepEqual(parseImport(exportJson(links)), links);
  assert.deepEqual(parseImport('{"A|Лекції":"https://a.example","bad":"http://x"}'), { "A|Лекції": "https://a.example" });
  assert.throws(() => parseImport("not json"));
  assert.throws(() => parseImport("[1,2]"));
  assert.throws(() => parseImport("{}"));
  assert.throws(() => parseImport('{"a":"http://only-insecure"}'));
});

test("exportJson is sorted and stable", () => {
  const text = exportJson({ "Б|Лекції": "https://b.example", "А|Лекції": "https://a.example" });
  assert.ok(text.indexOf("А|Лекції") < text.indexOf("Б|Лекції"));
  assert.ok(text.endsWith("\n"));
});

test("setLink adds, replaces and removes without mutating", () => {
  const start = { a: "https://a.example" };
  assert.deepEqual(setLink(start, "b", "https://b.example"), { a: "https://a.example", b: "https://b.example" });
  assert.deepEqual(setLink(start, "a", ""), {});
  assert.deepEqual(start, { a: "https://a.example" });
});

test("pair keys from settings match what the hero looks up", () => {
  const [pair] = collectPairs(classes);
  const cls = classes.find((c) => `${c.discipline}|${c.type}` === pair.key);
  assert.equal(findLink({ [pair.key]: "https://z.example" }, cls), "https://z.example");
});
