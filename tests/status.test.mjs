// computeStatus: the "Status test cases" from PLAN.md plus alarm edge cases.
// Fixture week (Mon 28.09 – Fri 02.10.2026, subgroup 1б):
//   Mon 08:15–09:35, 09:45–11:05, 11:15–12:35
//   Wed 09:45–11:05, 11:15–12:35, 12:50–14:10 (Кураторська година), 14:20–15:40
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeStatus } from "../js/status.js";
import { kyivLocalToDate } from "../js/format.js";
import { findLink } from "../js/links.js";
import { validateSchedule } from "../js/schedule.js";
import { buildSchedule } from "../scraper/scrape.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../scraper/fixtures/schedule-2026-09-28_2026-10-04.json", import.meta.url), "utf8"),
);
const schedule = validateSchedule(buildSchedule(fixture, {
  now: new Date("2026-09-28T03:00:00Z"), rangeFrom: "2026-09-28", rangeTo: "2026-10-11",
}));

const at = (local) => kyivLocalToDate(local);
const CLEAR = { state: "clear", seenSince: null, clearedAt: null };
const ALERT = { state: "alert", seenSince: at("2026-09-28T08:20"), clearedAt: null };
const UNKNOWN = { state: "unknown", seenSince: null, clearedAt: null };
const status = (local, alarm = CLEAR) => computeStatus(at(local), schedule, alarm);

describe("schedule states (no alarm)", () => {
  test("Mon 08:00 → soon, 15 min before the first class", () => {
    const s = status("2026-09-28T08:00");
    assert.equal(s.state, "soon");
    assert.equal(s.minutesUntil, 15);
    assert.equal(s.cls.discipline, "Іноземна мова");
  });

  test("Mon 07:00 → upcoming (first class is more than 15 min away)", () => {
    const s = status("2026-09-28T07:00");
    assert.equal(s.state, "upcoming");
    assert.equal(s.minutesUntil, 75);
  });

  test("Mon 08:30 → live, with time left and progress", () => {
    const s = status("2026-09-28T08:30");
    assert.equal(s.state, "live");
    assert.equal(s.cls.discipline, "Іноземна мова");
    assert.equal(s.minutesLeft, 65);
    assert.ok(Math.abs(s.progress - 15 / 80) < 1e-9);
    assert.equal(s.nextClass.start, "09:45");
  });

  test("class boundaries: start minute is live, end minute is not", () => {
    assert.equal(status("2026-09-28T08:15").state, "live");
    assert.equal(status("2026-09-28T09:34:59").state, "live");
    assert.equal(status("2026-09-28T09:35").state, "soon"); // next at 09:45
  });

  test("Mon 09:38 → soon (short break before the next class)", () => {
    const s = status("2026-09-28T09:38");
    assert.equal(s.state, "soon");
    assert.equal(s.minutesUntil, 7);
    assert.equal(s.cls.discipline, "Трактори і автомобілі");
  });

  test("long gap between classes → break", () => {
    const gappy = validateSchedule({
      ...schedule,
      classes: [
        { date: "2026-09-28", start: "08:15", end: "09:35", discipline: "A", type: "Лекції", room: "", teacher: "" },
        { date: "2026-09-28", start: "12:50", end: "14:10", discipline: "B", type: "Лекції", room: "", teacher: "" },
      ],
    });
    const s = computeStatus(at("2026-09-28T10:00"), gappy, CLEAR);
    assert.equal(s.state, "break");
    assert.equal(s.cls.discipline, "B");
  });

  test("Mon 13:00 → done, next class is tomorrow 08:15", () => {
    const s = status("2026-09-28T13:00");
    assert.equal(s.state, "done");
    assert.equal(s.cls, undefined);
    assert.equal(s.nextClass.date, "2026-09-29");
    assert.equal(s.nextClass.start, "08:15");
  });

  test("Wed 12:36 → soon for Кураторська година, which has no link", () => {
    const s = status("2026-09-30T12:36");
    assert.equal(s.state, "soon");
    assert.equal(s.cls.discipline, "Кураторська година");
    assert.equal(s.cls.teacher, "");
    assert.equal(findLink({ "Трактори і автомобілі|Лекції": "https://x" }, s.cls), null);
  });

  test("Sat → weekend, next class Monday", () => {
    const s = status("2026-10-03T10:00");
    assert.equal(s.state, "weekend");
    assert.equal(s.isWeekend, true);
    assert.equal(s.nextClass, null); // the fixture has no following week
  });

  test("weekday without classes → weekend state, but not isWeekend", () => {
    const s = status("2026-10-07T10:00");
    assert.equal(s.state, "weekend");
    assert.equal(s.isWeekend, false);
  });

  test("no schedule, or a day outside the range → nodata", () => {
    assert.equal(computeStatus(at("2026-09-28T10:00"), null, CLEAR).state, "nodata");
    assert.equal(status("2026-10-12T10:00").state, "nodata");
    assert.equal(status("2026-09-27T10:00").state, "nodata");
  });
});

describe("air alarm", () => {
  test("Mon 08:30 with alarm → paused; the end time does not move", () => {
    const s = status("2026-09-28T08:30", ALERT);
    assert.equal(s.state, "paused");
    assert.equal(s.alarm, "alert");
    assert.equal(s.cls.end, "09:35");
    assert.equal(s.minutesLeft, 65);
  });

  test("alarm 10 min before a class → paused", () => {
    const s = status("2026-09-28T08:05", ALERT);
    assert.equal(s.state, "paused");
    assert.equal(s.cls.discipline, "Іноземна мова");
  });

  test("alarm with nothing live or soon → normal state, alarm still reported", () => {
    const early = status("2026-09-28T07:00", ALERT);
    assert.equal(early.state, "upcoming");
    assert.equal(early.alarm, "alert");
    const evening = status("2026-09-28T13:00", ALERT);
    assert.equal(evening.state, "done");
    assert.equal(evening.alarm, "alert");
  });

  test("alarm ended 5 min ago during the class → resumed", () => {
    const alarm = { state: "clear", seenSince: null, clearedAt: at("2026-09-28T08:25") };
    const s = status("2026-09-28T08:30", alarm);
    assert.equal(s.state, "resumed");
    assert.equal(s.minutesLeft, 65);
  });

  test("resumed lasts less than 10 minutes", () => {
    const alarm = { state: "clear", seenSince: null, clearedAt: at("2026-09-28T08:25") };
    assert.equal(status("2026-09-28T08:34:59", alarm).state, "resumed");
    assert.equal(status("2026-09-28T08:35", alarm).state, "live");
  });

  test("alarm that ended before the class started → just live", () => {
    const alarm = { state: "clear", seenSince: null, clearedAt: at("2026-09-28T08:10") };
    assert.equal(status("2026-09-28T08:16", alarm).state, "live");
  });

  test("alarm that ended recently but no class is live → no resumed", () => {
    const alarm = { state: "clear", seenSince: null, clearedAt: at("2026-09-28T12:55") };
    assert.equal(status("2026-09-28T13:00", alarm).state, "done");
  });

  test("clearedAt in the future (clock skew) is ignored", () => {
    const alarm = { state: "clear", seenSince: null, clearedAt: at("2026-09-28T08:40") };
    assert.equal(status("2026-09-28T08:30", alarm).state, "live");
  });

  test("clearedAt as an ISO string works too", () => {
    const alarm = { state: "clear", seenSince: null, clearedAt: at("2026-09-28T08:25").toISOString() };
    assert.equal(status("2026-09-28T08:30", alarm).state, "resumed");
  });
});

describe("unknown alarm state is never reported as clear", () => {
  const moments = [
    "2026-09-28T07:00", "2026-09-28T08:00", "2026-09-28T08:30", "2026-09-28T09:38",
    "2026-09-28T13:00", "2026-10-03T10:00", "2026-10-12T10:00",
  ];

  test("unknown keeps the normal state and reports alarm: unknown", () => {
    for (const m of moments) {
      const s = status(m, UNKNOWN);
      assert.equal(s.alarm, "unknown", m);
      assert.equal(s.state, status(m, CLEAR).state, m);
    }
  });

  test("missing or garbage alarm input counts as unknown", () => {
    for (const alarm of [null, {}, { state: "ok" }, { state: "" }]) {
      assert.equal(status("2026-09-28T08:30", alarm).alarm, "unknown", JSON.stringify(alarm));
    }
  });

  test("unknown never produces resumed, even with a recent clearedAt", () => {
    const alarm = { state: "unknown", seenSince: null, clearedAt: at("2026-09-28T08:25") };
    assert.equal(status("2026-09-28T08:30", alarm).state, "live");
  });
});

test("computeStatus does not mutate its inputs", () => {
  const before = JSON.stringify(schedule);
  const alarm = { ...ALERT };
  status("2026-09-28T08:30", alarm);
  assert.equal(JSON.stringify(schedule), before);
  assert.deepEqual(alarm, ALERT);
});

test("time math uses Kyiv time in winter too (UTC+2)", () => {
  const winter = validateSchedule({
    ...schedule, rangeFrom: "2026-12-01", rangeTo: "2026-12-14",
    classes: [{ date: "2026-12-01", start: "08:15", end: "09:35", discipline: "A", type: "Лекції", room: "", teacher: "" }],
  });
  // 06:30 UTC = 08:30 Kyiv in winter
  assert.equal(computeStatus(new Date("2026-12-01T06:30:00Z"), winter, CLEAR).state, "live");
});
