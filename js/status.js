// computeStatus(now, schedule, alarm) -> what the hero card should show.
// PURE: no DOM, no clock, no storage. All times are Europe/Kyiv wall time.
//
// Phase 3 version: handles the schedule-based states. The air alarm states
// (paused / resumed / unknown) and the full test table come in Phase 4.

import { kyivParts, toMinutes, weekdayOf } from "./format.js";

export const SOON_MINUTES = 15;

export function computeStatus(now, schedule, alarm = { state: "clear" }) {
  const { date: today, minutes: nowMin, seconds } = kyivParts(now);
  const nowExact = nowMin + seconds / 60;
  const base = { today, alarm: alarm.state };

  if (!schedule || today < schedule.rangeFrom || today > schedule.rangeTo) {
    return { ...base, state: "nodata" };
  }

  const todays = schedule.classes.filter((c) => c.date === today);
  // First class that hasn't started yet, today or later.
  const nextClass = schedule.classes.find(
    (c) => c.date > today || (c.date === today && toMinutes(c.start) > nowMin),
  ) ?? null;

  const current = todays.find((c) => toMinutes(c.start) <= nowMin && nowMin < toMinutes(c.end));
  if (current) {
    const start = toMinutes(current.start);
    const end = toMinutes(current.end);
    return {
      ...base,
      state: "live",
      cls: current,
      minutesLeft: Math.ceil(end - nowExact),
      progress: Math.min(1, Math.max(0, (nowExact - start) / (end - start))),
      nextClass,
    };
  }

  const nextToday = nextClass?.date === today ? nextClass : null;
  if (nextToday) {
    const minutesUntil = Math.ceil(toMinutes(nextToday.start) - nowExact);
    const anyFinished = todays.some((c) => toMinutes(c.end) <= nowMin);
    const state = minutesUntil <= SOON_MINUTES ? "soon" : anyFinished ? "break" : "upcoming";
    return { ...base, state, cls: nextToday, minutesUntil, nextClass };
  }

  if (todays.length > 0) return { ...base, state: "done", nextClass };

  const weekday = weekdayOf(today);
  return { ...base, state: "weekend", isWeekend: weekday === 0 || weekday === 6, nextClass };
}
