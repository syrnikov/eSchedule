// «Статистика» (#stats), opened from the home header: the «Приєднатися» taps this device has
// logged, laid out like a banking app's statistics. A tap isn't attendance, so: counts only,
// never percentages, never "attendance", nothing about missed classes (see stats.js).
// Rendered when opened (stats load from IndexedDB), and again when the period or grouping changes.

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { formatIsoDayMonth, formatDuration, pluralize, keepName } from "./format.js";
import { typeIcon } from "./class-row.js";
import { accentIndex } from "./voice.js";
import { initialOf } from "./profile.js";
import { loadJoins, clearJoins, summarize, periodRange, PERIODS } from "./stats.js";
import { group } from "./settings.js";

const V = STRINGS.statsView;
const S = STRINGS.settingsView;
const PREFS_KEY = "pary.statsView.v1";
const GROUPINGS = ["subjects", "teachers"];

// The period and grouping last chosen on this device (a convenience, so storage may fail).
function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      period: PERIODS.includes(saved.period) ? saved.period : "week",
      grouping: GROUPINGS.includes(saved.grouping) ? saved.grouping : "subjects",
    };
  } catch {
    return { period: "week", grouping: "subjects" };
  }
}
function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* fine: just not remembered */ }
}

// "11" + "пар": the unit word on its own, for under a big number.
const unitOnly = (count, forms) => pluralize(count, forms).replace(/^\d+\s/, "");

// Segmented control (the same look as the reminder lead time in settings).
function segmented(name, legend, options, current, onPick) {
  return el("fieldset", { class: "segmented" },
    el("legend", { class: "sr-only" }, legend),
    el("div", { class: "segmented-options", style: `grid-template-columns: repeat(${options.length}, 1fr)` },
      options.map(({ value, label }) => {
        const input = el("input", { type: "radio", name, value });
        input.checked = value === current;
        input.addEventListener("change", () => onPick(value));
        return el("label", { class: "segment" }, input, el("span", {}, label));
      })));
}

// A soft square tile in the hero card: icon, big number, word.
const tile = (iconName, count, forms) =>
  el("div", { class: "stat-tile" },
    el("span", { class: "stat-tile-icon" }, icon(iconName, "20")),
    el("p", { class: "stat-tile-number" }, String(count)),
    el("p", { class: "stat-tile-label" }, unitOnly(count, forms)));

function hero(summary) {
  const m = summary.typicalMinutes;
  // Early or on time gets a line; a late typical time gets none (no guilt, ever).
  const typical = m == null ? "" : m <= -1 ? STRINGS.stats.early(formatDuration(-m)) : m < 1 ? STRINGS.stats.onTime : "";
  return el("section", { class: "card stat-hero" },
    el("span", { class: "stat-badge" }, icon("videocam")),
    el("p", { class: "stat-label" }, V.heroLabel),
    el("p", { class: "stat-number" },
      String(summary.classes), el("span", { class: "stat-unit" }, unitOnly(summary.classes, STRINGS.units.classes))),
    typical && el("p", { class: "stat-note" }, icon("schedule", "20"), el("span", {}, typical)),
    el("div", { class: "stat-tiles" },
      tile("school", summary.subjects, STRINGS.units.subjects),
      tile("calendar_month", summary.days, STRINGS.units.days)));
}

// One row per subject or teacher: round icon, name, a bar relative to the top row, the count.
function breakdown(summary, grouping) {
  const rows = grouping === "teachers"
    ? summary.byTeacher.map((t) => ({ name: keepName(t.teacher), count: t.count, accent: accentIndex(t.teacher), mark: initialOf(t.teacher) }))
    : summary.bySubject.map((s) => ({ name: s.discipline, count: s.count, accent: accentIndex(s.discipline), mark: icon(typeIcon(s.type), "20") }));
  const top = rows[0]?.count ?? 1;
  return el("ul", { class: "stat-rows" }, rows.map((r) => el("li", { class: "stat-row" },
    el("span", { class: "stat-row-icon", "data-accent": r.accent, "aria-hidden": "true" }, r.mark),
    el("div", { class: "stat-row-text" },
      el("p", { class: "stat-row-name" }, r.name),
      el("div", { class: "stat-bar", "aria-hidden": "true" },
        el("span", { class: "stat-bar-fill", "data-accent": r.accent, style: `width: ${Math.max(6, (r.count / top) * 100).toFixed(1)}%` }))),
    el("p", { class: "stat-row-count" }, pluralize(r.count, STRINGS.units.classes)))));
}

// «Очистити статистику»: takes a second tap within 5 s (no browser confirm() dialogs here).
function clearButton(onCleared) {
  const status = el("p", { class: "settings-status", "aria-live": "polite" });
  const button = el("button", { type: "button", class: "btn btn--secondary btn--wide" }, S.statsClear);
  let timer = null;
  const reset = () => { timer = null; button.textContent = S.statsClear; button.classList.remove("btn--danger"); };
  button.addEventListener("click", async () => {
    if (!timer) {
      button.textContent = S.statsClearConfirm;
      button.classList.add("btn--danger");
      timer = setTimeout(reset, 5000);
      return;
    }
    clearTimeout(timer);
    reset();
    const ok = await clearJoins();
    if (ok) return onCleared();
    status.textContent = S.storageBlocked;
    status.className = "settings-status is-error";
  });
  return el("div", { class: "stats-actions" }, button, status);
}

export async function renderStatsView(container, { today }) {
  const joins = await loadJoins();
  const prefs = loadPrefs();

  function draw({ keepFocus = false } = {}) {
    const range = periodRange(prefs.period, today, joins);
    const summary = summarize(joins, range);
    const subtitle = prefs.period === "all"
      ? V.since(formatIsoDayMonth(range.from))
      : V.range(formatIsoDayMonth(range.from), formatIsoDayMonth(range.to));

    const pick = (key) => (value) => { prefs[key] = value; savePrefs(prefs); draw({ keepFocus: true }); };
    const periods = segmented("stats-period", V.periodLabel,
      PERIODS.map((p) => ({ value: p, label: V.periods[p] })), prefs.period, pick("period"));

    const body = summary.classes === 0
      ? [el("p", { class: "card card--compact day-none" }, joins.length ? V.emptyPeriod : V.empty)]
      : [
        hero(summary),
        segmented("stats-grouping", V.groupLabel,
          GROUPINGS.map((g) => ({ value: g, label: V.groupings[g] })), prefs.grouping, pick("grouping")),
        el("section", { class: "card" }, breakdown(summary, prefs.grouping)),
      ];

    const focused = keepFocus && document.activeElement?.name;
    container.replaceChildren(
      el("div", { class: "settings-top" },
        el("a", { class: "icon-btn", href: "#", "aria-label": S.back }, icon("arrow_back"))),
      el("div", { class: "stat-head" },
        el("h1", { class: "settings-title stat-title", tabindex: "-1" }, V.title),
        el("p", { class: "stat-period" }, subtitle)),
      periods,
      ...body,
      joins.length > 0 && group(V.dataGroup,
        el("div", { class: "card" },
          el("p", { class: "field-context section-hint" }, S.statsHint),
          el("p", { class: "field-context" }, S.statsCount(pluralize(joins.length, STRINGS.units.records))),
          clearButton(() => { joins.length = 0; draw(); }))));

    // A tap on a segment rebuilds the screen: keep the keyboard focus on the same control.
    if (focused) container.querySelector(`input[name="${focused}"]:checked`)?.focus();
    else container.querySelector(".stat-title").focus({ preventScroll: true });
  }

  draw();
  window.scrollTo(0, 0);
}
