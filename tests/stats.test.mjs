// Local stats (pure parts) and the versioned backup file.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeJoin, sanitizeJoins, mergeJoins, weekStart, weekSummary, MAX_JOINS, MIN_CLASSES_FOR_CARD,
} from "../js/stats.js";
import { buildBackup, parseBackup, BACKUP_VERSION } from "../js/backup.js";
import { exportJson } from "../js/links.js";
import { kyivLocalToDate } from "../js/format.js";
import { STRINGS } from "../js/strings.js";

const cls = (date, start, discipline = "Іноземна мова") =>
  ({ date, start, end: "23:59", discipline, teacher: "Насакіна С. В.", type: "Практичні", room: "" });
const tap = (date, start, local, discipline) => makeJoin(cls(date, start, discipline), kyivLocalToDate(local), false);

test("makeJoin: minutes relative to start, negative = early, Kyiv time", () => {
  const early = makeJoin(cls("2026-09-28", "08:15"), kyivLocalToDate("2026-09-28T08:12"), true);
  assert.equal(early.minutes, -3);
  assert.equal(early.alert, true);
  assert.equal(early.date, "2026-09-28");
  assert.equal(early.type, "Практичні");
  assert.equal(tap("2026-09-28", "08:15", "2026-09-28T08:25").minutes, 10);
  // Winter time (UTC+2) too
  assert.equal(tap("2026-12-01", "08:15", "2026-12-01T08:10").minutes, -5);
  // Nothing link-shaped is stored.
  assert.deepEqual(Object.keys(early).sort(),
    ["alert", "at", "date", "discipline", "minutes", "start", "teacher", "type"]);
});

test("weekStart is the Monday of that week", () => {
  assert.equal(weekStart("2026-09-28"), "2026-09-28"); // Monday
  assert.equal(weekStart("2026-10-04"), "2026-09-28"); // Sunday
  assert.equal(weekStart("2026-10-01"), "2026-09-28");
});

test("weekSummary: nothing until enough classes; one count per class; median of first taps", () => {
  const today = "2026-09-30";
  const joins = [
    tap("2026-09-28", "08:15", "2026-09-28T08:12"), // -3
    tap("2026-09-28", "08:15", "2026-09-28T08:40"), // same class again (rejoin): ignored
    tap("2026-09-28", "09:45", "2026-09-28T09:44", "Трактори"), // -1
  ];
  assert.equal(weekSummary(joins, today), null, `needs ${MIN_CLASSES_FOR_CARD} classes`);

  joins.push(tap("2026-09-30", "11:15", "2026-09-30T11:10", "Теплотехніка")); // -5
  joins.push(tap("2026-09-21", "08:15", "2026-09-21T08:00", "Минулий тиждень")); // last week: out
  assert.deepEqual(weekSummary(joins, today), { classes: 3, typicalMinutes: -3 });
  assert.equal(weekSummary(joins, "2026-10-05"), null, "a new week starts from zero");
});

test("stats copy: honest and guilt-free", () => {
  const all = JSON.stringify(Object.values(STRINGS.stats).map((v) => (typeof v === "function" ? v("X") : v)));
  assert.doesNotMatch(all, /відвідуван|%|пропуст|прогул/i);
});

test("sanitizeJoins keeps well-formed records only, capped, sorted", () => {
  const good = tap("2026-09-28", "08:15", "2026-09-28T08:12");
  const out = sanitizeJoins([
    good,
    { ...good, at: "yesterday" },
    { ...good, minutes: 99999 },
    { ...good, discipline: "" },
    { ...good, alert: "no" },
    { ...good, discipline: "x".repeat(500) },
    { ...good, extra: "<script>" }, // extra fields are dropped, record kept
    null, 42,
  ]);
  assert.equal(out.length, 2);
  assert.ok(out.every((j) => !("extra" in j)));
  assert.deepEqual(sanitizeJoins("nope"), []);
  const many = Array.from({ length: MAX_JOINS + 10 }, (_, i) =>
    ({ ...good, at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString() }));
  const capped = sanitizeJoins(many);
  assert.equal(capped.length, MAX_JOINS);
  assert.equal(capped.at(-1).at, many.at(-1).at, "keeps the newest");
});

test("mergeJoins skips records we already have", () => {
  const a = tap("2026-09-28", "08:15", "2026-09-28T08:12");
  const b = tap("2026-09-28", "09:45", "2026-09-28T09:44", "Трактори");
  assert.deepEqual(mergeJoins([a], [a, b]), [b]);
});

test("backup v2 round trip: links and stats", () => {
  const links = { "@Насакіна С. В.": "https://zoom.us/j/1" };
  const joins = [tap("2026-09-28", "08:15", "2026-09-28T08:12")];
  const text = buildBackup(links, joins);
  assert.equal(JSON.parse(text).version, BACKUP_VERSION);
  assert.deepEqual(parseBackup(text), { links, joins });
});

test("backup: old files (links only, no version) still import", () => {
  const links = { "@Насакіна С. В.": "https://zoom.us/j/1", "Кураторська година|Лекції": "https://zoom.us/j/2" };
  assert.deepEqual(parseBackup(exportJson(links)), { links, joins: [] });
});

test("backup: junk is rejected, bad parts are dropped", () => {
  assert.throws(() => parseBackup("not json"));
  assert.throws(() => parseBackup("[1]"));
  assert.throws(() => parseBackup("{}"));
  assert.throws(() => parseBackup(JSON.stringify({ version: 2, links: {}, stats: { joins: [] } })));
  const mixed = parseBackup(JSON.stringify({
    version: 2,
    links: { "@A": "javascript:alert(1)", "@B": "https://zoom.us/j/3" },
    stats: { joins: [{ at: "x" }] },
  }));
  assert.deepEqual(mixed, { links: { "@B": "https://zoom.us/j/3" }, joins: [] });
  // Stats alone are a valid backup too.
  const joins = [tap("2026-09-28", "08:15", "2026-09-28T08:12")];
  assert.deepEqual(parseBackup(buildBackup({}, joins)).joins, joins);
});
