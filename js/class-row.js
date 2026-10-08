// One class as a compact row: time, subject, type · teacher. Used by «Сьогодні» and «Наступні дні».

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { keepName } from "./format.js";

export const typeIcon = (type) => STRINGS.data.typeIcons[type] ?? STRINGS.data.defaultTypeIcon;
export const joinDot = (...parts) => parts.filter(Boolean).join(" · ");
export const showRoom = (room) => (room && room !== STRINGS.data.onlineRoom ? room : "");

// past: already over (dimmed). live: running now (gets the «зараз» badge).
// due: a task for this subject is due that day (a small marker after the name).
export function classRow(c, { past = false, live = false, due = false } = {}) {
  return el("li", { class: `row${past ? " is-past" : ""}${live ? " is-now" : ""}` },
    el("div", { class: "row-time" }, c.start, el("small", {}, c.end)),
    el("div", {},
      el("div", { class: "row-title" }, icon(typeIcon(c.type), "20"), el("span", {}, c.discipline),
        due && el("a", { class: "due-mark", href: "#tasks", "aria-label": STRINGS.deadlines.mark, title: STRINGS.deadlines.mark },
          icon("assignment", "20"))),
      el("div", { class: "row-sub" }, joinDot(c.type, keepName(c.teacher), showRoom(c.room)))),
    live ? el("span", { class: "badge" }, STRINGS.nowBadge) : el("span"));
}
