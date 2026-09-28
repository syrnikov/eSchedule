import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  kyivDate, addDays, toApiDate, rangeFor, scheduleUrl, buildSchedule, rejectReason,
} from "../scraper/scrape.mjs";

const fixture = JSON.parse(
  await readFile(new URL("../scraper/fixtures/schedule-2026-09-28_2026-10-04.json", import.meta.url), "utf8"),
);

test("today is computed in Kyiv time, not UTC", () => {
  // Kyiv is UTC+3 in summer: 21:30Z on the 27th is already 00:30 on the 28th.
  assert.equal(kyivDate(new Date("2026-09-27T21:30:00Z")), "2026-09-28");
  assert.equal(kyivDate(new Date("2026-09-27T20:59:00Z")), "2026-09-27");
  // Winter (UTC+2): 22:30Z on 1 Dec is 00:30 on 2 Dec.
  assert.equal(kyivDate(new Date("2026-12-01T22:30:00Z")), "2026-12-02");
});

test("range is today + 13 days, across month ends and DST", () => {
  assert.deepEqual(rangeFor(new Date("2026-09-28T06:00:00Z")), {
    rangeFrom: "2026-09-28", rangeTo: "2026-10-11",
  });
  assert.equal(addDays("2026-10-20", 13), "2026-11-02"); // DST ends 25 Oct
  assert.equal(addDays("2026-12-25", 13), "2027-01-07");
});

test("API dates and query string use the API's formats", () => {
  assert.equal(toApiDate("2026-09-28"), "28.09.2026");
  const url = new URL(scheduleUrl("2026-09-28", "2026-10-04"));
  assert.equal(url.pathname, "/WidgetSchedule.asmx/GetScheduleDataX");
  assert.equal(url.searchParams.get("aVuzID"), "11912");
  assert.equal(url.searchParams.get("aStudyGroupID"), '"O4H7V339WI8I"');
  assert.equal(url.searchParams.get("aStartDate"), '"28.09.2026"');
  assert.equal(url.searchParams.get("aEndDate"), '"04.10.2026"');
  assert.equal(url.searchParams.get("aStudyTypeID"), "null");
});

test("buildSchedule matches the data contract", () => {
  const now = new Date("2026-09-28T06:00:00.123Z");
  const s = buildSchedule(fixture, { now, rangeFrom: "2026-09-28", rangeTo: "2026-10-11" });
  assert.equal(s.group, "208-бак-3к денне 26-27");
  assert.equal(s.subgroup, "1б");
  assert.equal(s.source, "https://osau.edu.ua/pro-universytet/pratsivnykam/rozklad-zanyat/");
  assert.equal(s.fetchedAt, "2026-09-28T06:00:00Z");
  assert.equal(s.rangeFrom, "2026-09-28");
  assert.equal(s.rangeTo, "2026-10-11");
  assert.equal(s.classes.length, 14);
});

test("empty result is rejected only if the old file had classes in that range", () => {
  const empty = { rangeFrom: "2026-09-28", rangeTo: "2026-10-11", classes: [] };
  const prevWithClasses = { classes: [{ date: "2026-09-29" }] };
  const prevOnlyOlder = { classes: [{ date: "2026-09-20" }] };

  assert.match(rejectReason(prevWithClasses, empty), /0 classes/);
  assert.equal(rejectReason(prevOnlyOlder, empty), null); // e.g. holidays
  assert.equal(rejectReason(null, empty), null); // first run
  assert.equal(rejectReason(prevWithClasses, { ...empty, classes: [{}] }), null);
});
