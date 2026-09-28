import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed, nextAlarmState, INITIAL } from "../js/alarm.js";
import { computeStatus } from "../js/status.js";

const feed = (alertnow) => ({
  source: "test", cachedat: "2026-09-28 10:47:35",
  states: { "Одеська область": { alertnow, changed: "1970-01-01 03:00:00" }, "Київська область": { alertnow: true } },
});
const t = (hhmm) => new Date(`2026-09-28T${hhmm}:00+03:00`);

test("parseFeed reads Одеська область only", () => {
  assert.equal(parseFeed(feed(false)), false);
  assert.equal(parseFeed(feed(true)), true);
  assert.throws(() => parseFeed({ states: {} }));
  assert.throws(() => parseFeed({ states: { "Одеська область": { alertnow: "yes" } } }));
  assert.throws(() => parseFeed(null));
});

test("starts unknown and pending", () => {
  assert.equal(INITIAL.state, "unknown");
  assert.equal(INITIAL.pending, true);
});

test("alert: seenSince is when we first saw it, and it sticks", () => {
  let s = nextAlarmState(INITIAL, { ok: true, alert: true }, t("08:20"));
  assert.equal(s.state, "alert");
  assert.deepEqual(s.seenSince, t("08:20"));
  s = nextAlarmState(s, { ok: true, alert: true }, t("08:21"));
  assert.deepEqual(s.seenSince, t("08:20"));
});

test("alert → clear sets clearedAt; clear → clear keeps it", () => {
  let s = nextAlarmState(INITIAL, { ok: true, alert: true }, t("08:20"));
  s = nextAlarmState(s, { ok: true, alert: false }, t("08:40"));
  assert.equal(s.state, "clear");
  assert.equal(s.seenSince, null);
  assert.deepEqual(s.clearedAt, t("08:40"));
  s = nextAlarmState(s, { ok: true, alert: false }, t("08:41"));
  assert.deepEqual(s.clearedAt, t("08:40"));
});

test("alert → clear remembers when that alert started; the next alert doesn't erase it", () => {
  let s = nextAlarmState(INITIAL, { ok: true, alert: true }, t("08:20"));
  assert.equal(s.lastAlertSince, null);
  s = nextAlarmState(s, { ok: true, alert: false }, t("08:43"));
  assert.deepEqual(s.lastAlertSince, t("08:20"));
  s = nextAlarmState(s, { ok: true, alert: false }, t("08:44"));
  assert.deepEqual(s.lastAlertSince, t("08:20"));
  s = nextAlarmState(s, { ok: true, alert: true }, t("09:00"));
  assert.deepEqual(s.lastAlertSince, t("08:20"));
  s = nextAlarmState(s, { ok: true, alert: false }, t("09:10"));
  assert.deepEqual(s.lastAlertSince, t("09:00"));
});

test("unknown → clear doesn't invent an end time", () => {
  const s = nextAlarmState(INITIAL, { ok: true, alert: false }, t("08:40"));
  assert.equal(s.state, "clear");
  assert.equal(s.clearedAt, null);
});

test("failures: clear becomes unknown, alert stays alert", () => {
  const clear = nextAlarmState(INITIAL, { ok: true, alert: false }, t("08:00"));
  const lost = nextAlarmState(clear, { ok: false }, t("08:01"));
  assert.equal(lost.state, "unknown");
  assert.equal(lost.failures, 1);

  const alert = nextAlarmState(INITIAL, { ok: true, alert: true }, t("08:00"));
  const lostAlert = nextAlarmState(alert, { ok: false }, t("08:01"));
  assert.equal(lostAlert.state, "alert");
  assert.deepEqual(lostAlert.seenSince, t("08:00"));
});

test("failures count up and reset on success", () => {
  let s = INITIAL;
  for (let i = 0; i < 3; i++) s = nextAlarmState(s, { ok: false }, t("08:00"));
  assert.equal(s.failures, 3);
  s = nextAlarmState(s, { ok: true, alert: false }, t("08:05"));
  assert.equal(s.failures, 0);
});

test("end to end: alarm during a class pauses it, then resumes", () => {
  const schedule = {
    rangeFrom: "2026-09-28", rangeTo: "2026-09-28",
    classes: [{ date: "2026-09-28", start: "08:15", end: "09:35", discipline: "A", type: "Лекції", room: "", teacher: "" }],
  };
  let a = nextAlarmState(INITIAL, { ok: true, alert: false }, t("08:20"));
  assert.equal(computeStatus(t("08:20"), schedule, a).state, "live");
  a = nextAlarmState(a, { ok: true, alert: true }, t("08:30"));
  assert.equal(computeStatus(t("08:30"), schedule, a).state, "paused");
  a = nextAlarmState(a, { ok: true, alert: false }, t("08:50"));
  const resumed = computeStatus(t("08:52"), schedule, a);
  assert.equal(resumed.state, "resumed");
  assert.deepEqual(resumed.alertSince, t("08:30"));
  assert.deepEqual(resumed.clearedAt, t("08:50"));
  assert.equal(computeStatus(t("09:00"), schedule, a).state, "live");
});
