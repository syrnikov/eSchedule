// #join: where a reminder or an all-clear push lands. One class, one big button.

import { STRINGS } from "./strings.js";
import { el } from "./dom.js";
import { keepName, formatRange } from "./format.js";
import { joinDot, showRoom } from "./class-row.js";

// States in which «Приєднатися» is the thing to do. Not "paused": shelter comes first,
// and the home screen says so.
const JOINABLE = ["live", "resumed", "soon", "upcoming", "break"];

// PURE: the class to join for this status, or null (then the home screen is the right place).
export const joinTarget = (status) => (JOINABLE.includes(status?.state) && status.cls ? status.cls : null);

// label: the status line («Наживо», «Почнеться за 5 хв»…). button: the «Приєднатися» link.
export function renderJoin(container, { cls, label, button }) {
  container.replaceChildren(
    el("section", { class: "card join-card" },
      el("p", { class: "join-label" }, label),
      el("h1", { class: "class-title", tabindex: "-1" }, cls.discipline),
      el("p", { class: "class-meta" }, joinDot(cls.type, keepName(cls.teacher), showRoom(cls.room))),
      el("div", { class: "timing" }, el("span", {}, formatRange(cls.start, cls.end))),
      button),
    el("a", { class: "btn btn--text", href: "#" }, STRINGS.joinView.home));
  container.querySelector(".class-title").focus({ preventScroll: true });
}
