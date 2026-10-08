// The floating tab bar: Пари · Завдання · Викладачі. Shown on those three screens only;
// sub-screens (settings, days, join, onboarding) have a back arrow instead.
// Tabs replace the history entry rather than adding one, like an app's tab bar: the back
// gesture leaves the app instead of walking back through every tab tapped.
// Each tab also keeps its scroll position, so coming back lands where you left off.

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";

export const TABS = [
  { view: "main", hash: "#", icon: "calendar_month" },
  { view: "tasks", hash: "#tasks", icon: "assignment" },
  { view: "teachers", hash: "#teachers", icon: "contact_mail" },
];

const isTab = (view) => TABS.some((t) => t.view === view);

const scrollByTab = {};
// Where to scroll a tab that was just opened from the bar: where it was left, else the top.
// Used once: opening a tab any other way (back arrow, a link) starts at the top.
export function tabScroll(view) {
  const y = scrollByTab[view] ?? 0;
  delete scrollByTab[view];
  return y;
}

export function renderTabbar(nav, current) {
  const show = isTab(current);
  nav.hidden = !show;
  document.body.classList.toggle("has-tabbar", show);
  if (!show) return;

  if (!nav.childElementCount) {
    nav.setAttribute("aria-label", STRINGS.tabs.label);
    nav.append(...TABS.map((t) => {
      const link = el("a", { class: "tab", href: t.hash, "data-view": t.view },
        icon(t.icon), el("span", { class: "tab-label" }, STRINGS.tabs[t.view]));
      link.addEventListener("click", (event) => {
        event.preventDefault();
        const current = nav.querySelector('[aria-current="page"]');
        if (current === link) return window.scrollTo({ top: 0, behavior: "smooth" });
        if (current) scrollByTab[current.dataset.view] = window.scrollY;
        scrollByTab[t.view] ??= 0;
        location.replace(t.hash);
      });
      return link;
    }));
  }
  for (const link of nav.children) {
    if (link.dataset.view === current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
