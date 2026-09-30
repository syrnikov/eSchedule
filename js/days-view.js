// «Наступні дні» (#days): the schedule after today, one card per day.
// Rendered when opened, not on the 15 s loop.

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { addDays, weekdayOf, formatLongDate, pluralize } from "./format.js";
import { classRow } from "./class-row.js";

const D = STRINGS.days;

// PURE: [{ date, classes }] from tomorrow to the end of the schedule.
// A weekday with no classes stays in (so it reads as a free day); an empty weekend doesn't.
export function daysAhead(schedule, today) {
  const days = [];
  if (!schedule) return days;
  for (let date = addDays(today, 1); date <= schedule.rangeTo; date = addDays(date, 1)) {
    const classes = schedule.classes.filter((c) => c.date === date);
    const weekday = weekdayOf(date);
    if (classes.length === 0 && (weekday === 0 || weekday === 6)) continue;
    days.push({ date, classes });
  }
  return days;
}

export function renderDays(container, schedule, today) {
  const tomorrow = addDays(today, 1);
  const cards = daysAhead(schedule, today).map(({ date, classes }) => {
    // Noon UTC is the same calendar day in Kyiv.
    const name = formatLongDate(new Date(`${date}T12:00:00Z`));
    return el("section", { class: "card" },
      el("div", { class: "day-head" },
        el("h2", { class: "day-name" }, date === tomorrow ? `${D.tomorrow} · ${name}` : name),
        classes.length > 0 && el("span", { class: "day-count" }, pluralize(classes.length, STRINGS.units.classes))),
      classes.length
        ? el("ul", { class: "rows" }, classes.map((c) => classRow(c)))
        : el("p", { class: "day-none" }, D.none));
  });

  container.replaceChildren(
    el("div", { class: "settings-top" },
      el("a", { class: "icon-btn", href: "#", "aria-label": STRINGS.settingsView.back }, icon("arrow_back")),
      el("h1", { class: "settings-title", tabindex: "-1" }, D.title)),
    ...(cards.length ? cards : [el("p", { class: "card card--compact day-none" }, schedule ? D.empty : D.noSchedule)]));

  container.querySelector(".settings-title").focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
