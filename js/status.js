// computeStatus(now, schedule, alarm) -> what the hero card should show.
// PURE: no DOM, no clock, no storage, never mutates its inputs.
// All schedule times are Europe/Kyiv wall time.
//
// alarm = {
//   state: "alert" | "clear" | "unknown",
//   seenSince: Date | null,  // when we first saw the current alert (Phase 5)
//   clearedAt: Date | null,  // when the last alert ended, if we saw it end
//   lastAlertSince: Date | null, // when that alert started (optional)
// }
//
// States: live, soon, upcoming, break, done, weekend, nodata,
//         paused (alarm during/just before a class), resumed (alarm just ended mid-class).

import { kyivParts, toMinutes, weekdayOf } from "./format.js";

export const SOON_MINUTES = 15;
export const RESUMED_MINUTES = 10;

const CLEAR = { state: "clear", seenSince: null, clearedAt: null };

export function computeStatus(now, schedule, alarm = CLEAR) {
  const { date: today, minutes: nowMin, seconds } = kyivParts(now);
  const nowExact = nowMin + seconds / 60;
  // Anything we don't recognise counts as "unknown" — never as "clear".
  const alarmState = ["alert", "clear", "unknown"].includes(alarm?.state) ? alarm.state : "unknown";
  const base = { today, alarm: alarmState };

  if (!schedule || today < schedule.rangeFrom || today > schedule.rangeTo) {
    return { ...base, state: "nodata" };
  }

  const todays = schedule.classes.filter((c) => c.date === today);
  // First class that hasn't started yet, today or later.
  const nextClass = schedule.classes.find(
    (c) => c.date > today || (c.date === today && toMinutes(c.start) > nowMin),
  ) ?? null;

  // --- A class is running ---
  const current = todays.find((c) => toMinutes(c.start) <= nowMin && nowMin < toMinutes(c.end));
  if (current) {
    const start = toMinutes(current.start);
    const end = toMinutes(current.end);
    const live = {
      ...base,
      cls: current,
      // The scheduled end never moves, even during an alarm.
      minutesLeft: Math.ceil(end - nowExact),
      progress: Math.min(1, Math.max(0, (nowExact - start) / (end - start))),
      nextClass,
    };
    if (alarmState === "alert") return { ...live, state: "paused" };
    if (alarmState === "clear" && endedDuringClass(alarm.clearedAt, now, today, start)) {
      return { ...live, state: "resumed", alertSince: alarm.lastAlertSince ?? null, clearedAt: alarm.clearedAt };
    }
    return { ...live, state: "live" };
  }

  // --- Next class later today ---
  const nextToday = nextClass?.date === today ? nextClass : null;
  if (nextToday) {
    const minutesUntil = Math.ceil(toMinutes(nextToday.start) - nowExact);
    const soon = minutesUntil <= SOON_MINUTES;
    const upcoming = { ...base, cls: nextToday, minutesUntil, nextClass };
    if (soon && alarmState === "alert") return { ...upcoming, state: "paused" };
    if (soon) return { ...upcoming, state: "soon" };
    const anyFinished = todays.some((c) => toMinutes(c.end) <= nowMin);
    return { ...upcoming, state: anyFinished ? "break" : "upcoming" };
  }

  // --- Nothing more today ---
  if (todays.length > 0) return { ...base, state: "done", nextClass };

  const weekday = weekdayOf(today);
  return { ...base, state: "weekend", isWeekend: weekday === 0 || weekday === 6, nextClass };
}

// True if the alarm ended less than RESUMED_MINUTES ago, after the class started.
function endedDuringClass(clearedAt, now, today, classStartMin) {
  if (!clearedAt) return false;
  const cleared = new Date(clearedAt);
  const ago = (now - cleared) / 60_000;
  if (!(ago >= 0 && ago < RESUMED_MINUTES)) return false;
  const p = kyivParts(cleared);
  return p.date === today && p.minutes >= classStartMin;
}
