// First launch and links from the group: one page at a time, one main button per page.
//   links     opened with "#share=…": what the group sent, added with one tap
//   welcome   what the app does
//   install   iPhone in a browser tab: add to the home screen (reminders need it)
//   name      "Як до тебе звертатися?"
//   reminders turn on pushes
// Nothing is saved until the student taps the button on that page.

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { pluralize, keepName } from "./format.js";
import { decodeShare, diffShare } from "./share.js";
import { loadLinks, saveLinks } from "./links.js";
import { loadProfile, saveProfile, MAX_NAME_LENGTH } from "./profile.js";
import {
  pushSupport, loadPushPrefs, applyPush, groupKey, wantsPush, snoozePushCard, isIos, isStandalone,
} from "./push.js";

const O = STRINGS.onboarding;

// PURE: which pages to show, in order.
//   links: true when the share has something to add (or is broken and needs saying so)
export function onboardingPages({ links, onboarded, ios, standalone, support, wants }) {
  const pages = links ? ["links"] : [];
  if (onboarded) return pages; // a student who already uses the app only gets the links
  pages.push("welcome");
  // In an iPhone browser tab this is where most students leave for the home screen; the
  // installed app has its own empty storage and asks the rest there.
  if (ios && !standalone) pages.push("install");
  pages.push("name");
  if (support === "ok" && !wants) pages.push("reminders");
  return pages;
}

// Telegram opens links in its own browser, which can't add to the home screen.
const inTelegram = () =>
  Boolean(window.TelegramWebviewProxy || window.TelegramWebview) || /Telegram/i.test(navigator.userAgent);

// Icon + title + one line, as a list. Also used by «Що нового».
export function featureRows(items) {
  return el("ul", { class: "features" }, items.map((f) => el("li", {},
    el("span", { class: "feature-icon" }, icon(f.icon)),
    el("div", {},
      el("p", { class: "feature-title" }, f.title),
      el("p", { class: "feature-text" }, f.text)))));
}

// The page frame: content on top, buttons pinned to the bottom.
function page({ badge, title, text, body, actions }) {
  return el("section", { class: "onb" },
    el("div", { class: "onb-main" },
      badge,
      el("h1", { class: "onb-title", tabindex: "-1" }, title),
      text && el("p", { class: "onb-text" }, text),
      body),
    el("div", { class: "onb-actions" }, actions));
}
const badge = (iconEl, tone = "") => el("div", { class: `onb-badge${tone ? ` onb-badge--${tone}` : ""}` }, iconEl);
const primary = (text, attrs = {}) => el("button", { type: "button", class: "btn btn--primary", ...attrs }, text);
const quiet = (text) => el("button", { type: "button", class: "btn btn--text" }, text);

// --- Pages. Each gets next() and returns its element. ---

function linksPage({ entries, shareError }, next) {
  if (shareError) {
    const ok = primary(O.next);
    ok.addEventListener("click", next);
    return page({ badge: badge(icon("link_off", "40")), title: O.brokenTitle, text: shareError, actions: ok });
  }

  const replaces = entries.filter((e) => e.status === "replace").length;
  const status = el("p", { class: "settings-status is-error", "aria-live": "polite" });
  const add = primary(O.linksAdd);
  const skip = quiet(O.linksSkip);

  // Everything is ticked: the link was sent so that all of it gets added.
  const boxes = entries.map((entry, i) => {
    const box = el("input", { type: "checkbox", id: `share-${i}`, class: "share-check" });
    box.checked = true;
    box.addEventListener("change", () => { add.disabled = !boxes.some((b) => b.box.checked); });
    return { box, entry };
  });
  const items = boxes.map(({ box, entry: e }) => el("li", { class: "share-item" },
    el("label", { for: box.id, class: "share-row" },
      box,
      el("span", { class: "share-text" },
        el("span", { class: "share-name" }, e.sub ? `${e.title} · ${e.sub}` : keepName(e.title)),
        e.status === "replace" && el("span", { class: "share-badge" }, O.linksReplaces)))));

  add.addEventListener("click", () => {
    const links = loadLinks();
    for (const { box, entry } of boxes) if (box.checked) links[entry.key] = entry.url;
    if (!saveLinks(links)) { status.textContent = O.storageBlocked; return; }
    next();
  });
  skip.addEventListener("click", next);

  return page({
    badge: badge(icon("check_circle", "40"), "good"),
    title: O.linksTitle(pluralize(entries.length, STRINGS.units.links)),
    text: replaces ? `${O.linksText} ${O.linksReplace(replaces)}` : O.linksText,
    body: el("details", { class: "card card--compact disclosure onb-details" },
      el("summary", {}, el("span", { class: "disclosure-title" }, O.linksDetails), icon("expand_more", "20")),
      el("ul", { class: "share-list" }, items)),
    actions: [status, add, skip],
  });
}

function welcomePage(_, next) {
  const go = primary(O.next);
  go.addEventListener("click", next);
  return page({
    title: O.hello,
    text: O.intro,
    body: el("div", { class: "card" }, featureRows(O.features)),
    actions: go,
  });
}

function installPage(_, next) {
  const steps = inTelegram() ? [O.installTelegram, ...O.installSteps] : O.installSteps;
  const skip = quiet(O.installSkip);
  skip.addEventListener("click", next);
  return page({
    badge: badge(icon("add_box", "40")),
    title: O.installTitle,
    text: O.installText,
    body: [
      el("div", { class: "card" },
        el("ol", { class: "install-steps onb-steps" },
          steps.map((step, i) => el("li", {},
            el("span", { class: "install-num", "aria-hidden": "true" }, String(i + 1)),
            el("span", { class: "install-icon" }, icon(step.icon)),
            el("span", {}, step.text))))),
      !inTelegram() && el("p", { class: "onb-hint" }, O.installHint),
    ],
    actions: skip,
  });
}

function namePage(_, next) {
  const input = el("input", {
    id: "onb-name", type: "text", autocomplete: "given-name", autocapitalize: "words",
    enterkeyhint: "done", maxlength: String(MAX_NAME_LENGTH), placeholder: O.placeholder,
    "aria-labelledby": "onb-name-title", "aria-describedby": "onb-name-hint",
  });
  // If storage is blocked we still move on; main.js remembers for this session.
  const finish = (name) => { saveProfile({ name }); next(); };
  const submit = el("button", { type: "submit", class: "btn btn--primary" }, O.nameNext);
  const skip = quiet(O.skip);
  skip.addEventListener("click", () => finish(""));

  const form = el("form", { class: "onb onb-form" },
    el("div", { class: "onb-main" },
      el("h1", { class: "onb-title", id: "onb-name-title", tabindex: "-1" }, O.question),
      el("p", { class: "onb-text", id: "onb-name-hint" }, O.hint),
      input),
    el("div", { class: "onb-actions" }, submit, skip));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    finish(input.value);
  });
  return form;
}

function remindersPage({ getSchedule }, next) {
  const status = el("p", { class: "settings-status is-error", "aria-live": "polite" });
  const enable = primary(O.pushEnable);
  const later = quiet(O.pushLater);

  enable.addEventListener("click", async () => {
    const group = groupKey(getSchedule());
    if (!group) { status.textContent = STRINGS.settingsView.pushNoSchedule; return; }
    enable.disabled = true;
    status.textContent = "";
    try {
      await applyPush({ reminders: true, lead: 5, alerts: true }, group); // "on" or "denied": either way, move on
      return next();
    } catch (err) {
      console.warn(err);
      status.textContent = STRINGS.settingsView.pushError;
    }
    enable.disabled = false;
  });
  // Asked and answered: the home card shouldn't ask again right after.
  later.addEventListener("click", () => { snoozePushCard(); next(); });

  return page({
    badge: badge(icon("notifications", "40")),
    title: O.pushTitle,
    text: O.pushText,
    actions: [status, enable, later],
  });
}

const PAGES = { links: linksPage, welcome: welcomePage, install: installPage, name: namePage, reminders: remindersPage };

// fragment: what came after "#share=", or null. getSchedule(): the schedule, once loaded.
// onDone(): everything answered, show the home screen.
export async function renderOnboarding(container, { fragment, getSchedule, onDone }) {
  const wasOnboarded = loadProfile().onboarded;

  let entries = [];
  let shareError = "";
  if (fragment !== null) {
    try {
      // What the student already has isn't worth a page.
      entries = diffShare(await decodeShare(fragment), loadLinks()).filter((e) => e.status !== "same");
    } catch (err) {
      console.warn(err);
      shareError = err.code === "unsupported" ? O.tooOld : O.broken;
    }
  }

  const pages = onboardingPages({
    links: entries.length > 0 || Boolean(shareError),
    onboarded: wasOnboarded,
    ios: isIos(navigator),
    standalone: isStandalone(),
    support: pushSupport(),
    wants: wantsPush(loadPushPrefs()),
  });
  const context = { entries, shareError, getSchedule };

  let at = -1;
  const next = () => {
    at += 1;
    if (at >= pages.length) {
      // A new student has just been shown everything: no «Що нового» for them.
      if (!wasOnboarded) saveProfile({ newsSeen: STRINGS.whatsNew.version });
      return onDone();
    }
    container.replaceChildren(PAGES[pages[at]](context, next));
    // Focus the heading, not an input: on phones the keyboard would cover the page.
    container.querySelector(".onb-title").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  };
  next();
}
