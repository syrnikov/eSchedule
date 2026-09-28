// Settings screen, built from groups (Про тебе · Нагадування · Посилання · Резервна копія)
// plus a small credits footer.
// To add a setting later, add another group(...) in renderSettings.
// Rendered once when opened (not on the 15 s loop, so typing is never interrupted).

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { kyivParts, pluralize } from "./format.js";
import {
  loadLinks, saveLinks, setLink, isValidUrl, collectPairs, collectTeachers,
} from "./links.js";
import { buildBackup, parseBackup } from "./backup.js";
import { loadJoins, addJoins, mergeJoins, clearJoins } from "./stats.js";
import { loadProfile, saveProfile, cleanName, MAX_NAME_LENGTH } from "./profile.js";
import { pushSupport, loadPushPrefs, applyPush, groupKey, wantsPush, LEADS } from "./push.js";
import { ALARM_REGION } from "./config.js";
import { encodeShare, shareUrl } from "./share.js";

const S = STRINGS.settingsView;
const MAX_IMPORT_BYTES = 2_000_000; // links + up to MAX_JOINS stats records

// A titled group of cards.
const group = (title, ...cards) =>
  el("section", { class: "settings-group" }, el("h2", { class: "group-title" }, title), cards);

// On/off row: the whole row is the label, so the tap target is the full width.
function switchRow(id, label, hint, checked) {
  const input = el("input", { id, type: "checkbox", role: "switch", class: "switch" });
  input.checked = checked;
  const row = el("label", { class: "switch-row", for: id },
    el("span", { class: "switch-text" },
      el("span", { class: "field-label" }, label),
      hint && el("span", { class: "field-context" }, hint)),
    input);
  return { row, input };
}

// «Поділитися з групою»: all saved links in one URL (inside the #fragment, so no server sees them).
// The URL is prepared ahead of the tap: Safari only allows share/copy right inside the tap itself.
function shareCard() {
  const hint = el("p", { class: "field-context section-hint" });
  const status = el("p", { class: "settings-status", "aria-live": "polite" });
  const manual = el("div", { class: "share-manual", hidden: true });
  const button = el("button", { type: "button", class: "btn btn--primary btn--wide" }, icon("group"), S.shareButton);
  let prepared = null;

  async function prepare() {
    const links = loadLinks();
    const count = Object.keys(links).length;
    hint.textContent = count ? S.shareHint(pluralize(count, STRINGS.units.links)) : S.shareNothing;
    button.disabled = count === 0;
    manual.hidden = true;
    prepared = null;
    if (count) prepared = shareUrl(location.origin + location.pathname, await encodeShare(links));
  }

  const say = (text, error = false) => {
    status.textContent = text;
    status.className = `settings-status${error ? " is-error" : ""}`;
  };

  // Last resort: show the URL in a field to copy by hand.
  const showManual = () => {
    const field = el("input", { type: "text", readonly: true, "aria-label": S.shareCopyManual, value: prepared });
    manual.replaceChildren(el("p", { class: "field-context" }, S.shareCopyManual), field);
    manual.hidden = false;
    field.focus();
    field.select();
  };

  button.addEventListener("click", async () => {
    if (!prepared) return;
    say("");
    if (navigator.share) {
      try {
        return await navigator.share({ title: STRINGS.appTitle, text: S.shareText, url: prepared });
      } catch (err) {
        if (err?.name === "AbortError") return; // closed the share sheet: fine
      }
    }
    try {
      await navigator.clipboard.writeText(prepared);
      say(S.shareCopied);
    } catch {
      showManual();
    }
  });

  prepare();

  const card = el("div", { class: "card" },
    el("h3", { class: "card-title" }, S.shareTitle),
    hint,
    el("p", { class: "share-warning" }, icon("lock", "20"), el("span", {}, S.shareWarning)),
    button,
    manual,
    status);
  return { card, prepare };
}

// «Статистика»: what's stored, and a way to wipe it. Clearing takes a second tap
// (no browser confirm() dialogs in this app).
function statsCard() {
  const count = el("p", { class: "field-context" });
  const status = el("p", { class: "settings-status", "aria-live": "polite" });
  const button = el("button", { type: "button", class: "btn btn--secondary btn--wide" }, S.statsClear);
  let armed = false;
  let disarm = null;

  const show = (joins) => {
    count.textContent = joins.length ? S.statsCount(pluralize(joins.length, STRINGS.units.records)) : S.statsEmpty;
    button.disabled = joins.length === 0;
  };
  loadJoins().then(show);

  button.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      button.textContent = S.statsClearConfirm;
      button.classList.add("btn--danger");
      disarm = setTimeout(() => {
        armed = false;
        button.textContent = S.statsClear;
        button.classList.remove("btn--danger");
      }, 5000);
      return;
    }
    clearTimeout(disarm);
    armed = false;
    button.textContent = S.statsClear;
    button.classList.remove("btn--danger");
    const ok = await clearJoins();
    status.textContent = ok ? S.statsCleared : S.storageBlocked;
    status.className = `settings-status${ok ? "" : " is-error"}`;
    show(ok ? [] : await loadJoins());
  });

  return el("div", { class: "card" },
    el("p", { class: "field-context section-hint" }, S.statsHint),
    count,
    el("div", { class: "stats-actions" }, button),
    status);
}

// «Нагадування»: iOS install steps, a "can't" note, or the actual switches.
function pushCard(schedule) {
  const support = pushSupport();
  const card = el("div", { class: "card", "data-key": "push", tabindex: "-1" });

  if (support === "ios-install") {
    card.classList.add("install-card");
    card.append(
      el("p", { class: "install-title" }, S.iosTitle),
      el("ol", { class: "install-steps" },
        S.iosSteps.map((step, i) => el("li", {},
          el("span", { class: "install-num", "aria-hidden": "true" }, String(i + 1)),
          el("span", { class: "install-icon" }, icon(step.icon)),
          el("span", {}, step.text)))));
    return card;
  }
  if (support === "unsupported" || support === "denied") {
    card.append(el("p", { class: "field-context" }, support === "denied" ? S.pushDenied : S.pushUnsupported));
    return card;
  }

  const prefs = loadPushPrefs();
  const status = el("p", { class: "settings-status", "aria-live": "polite" });
  const reminders = switchRow("push-reminders", S.remindersLabel, S.remindersHint, prefs.reminders);
  const alerts = switchRow("push-alerts", S.alertsLabel, S.alertsHint(ALARM_REGION), prefs.alerts);

  const leadInputs = LEADS.map((mins) => {
    const input = el("input", { type: "radio", name: "push-lead", value: String(mins) });
    input.checked = prefs.lead === mins;
    return input;
  });
  const lead = el("fieldset", { class: "segmented" },
    el("legend", { class: "field-label" }, S.leadLabel),
    el("div", { class: "segmented-options" },
      leadInputs.map((input, i) => el("label", { class: "segment" }, input, el("span", {}, S.leadOption(LEADS[i]))))));
  lead.hidden = !prefs.reminders;

  const all = [reminders.input, alerts.input, ...leadInputs];
  const read = () => ({
    reminders: reminders.input.checked,
    alerts: alerts.input.checked,
    lead: Number(leadInputs.find((i) => i.checked)?.value ?? 5),
  });
  const show = (prefsNow) => {
    reminders.input.checked = prefsNow.reminders;
    alerts.input.checked = prefsNow.alerts;
    for (const i of leadInputs) i.checked = Number(i.value) === prefsNow.lead;
    lead.hidden = !prefsNow.reminders;
  };
  const say = (text, error = false) => {
    status.textContent = text;
    status.className = `settings-status${error ? " is-error" : ""}`;
  };

  async function onChange() {
    const before = loadPushPrefs();
    const next = read();
    lead.hidden = !next.reminders;
    const group = groupKey(schedule);
    if (wantsPush(next) && !group) { show(before); return say(S.pushNoSchedule, true); }

    say(S.pushWorking);
    for (const i of all) i.disabled = true;
    try {
      const result = await applyPush(next, group);
      if (result === "denied") return card.replaceWith(pushCard(schedule)); // shows the "blocked" note
      say(result === "on" ? S.pushOn : S.pushOff);
    } catch (err) {
      console.warn(err);
      show(before);
      say(S.pushError, true);
    } finally {
      for (const i of all) i.disabled = false;
    }
  }
  for (const i of all) i.addEventListener("change", onChange);

  card.append(
    el("div", { class: "field" }, reminders.row, lead),
    el("div", { class: "field" }, alerts.row),
    status);
  return card;
}

// focusKey: link key to focus (from the hero's «Додати»), or null.
export function renderSettings(container, schedule, { focusKey = null, message = "" } = {}) {
  const classes = schedule?.classes ?? [];
  const links = loadLinks();
  let fieldCount = 0;

  // One labelled URL input that saves itself when you leave the field.
  function field(key, name, context) {
    const id = `link-${fieldCount++}`;
    const msg = el("p", { class: "field-msg", id: `${id}-msg`, "aria-live": "polite" });
    const input = el("input", {
      id, type: "url", inputmode: "url", autocomplete: "off", spellcheck: "false",
      placeholder: S.placeholder, "aria-describedby": `${id}-msg`, "data-key": key,
    });
    input.value = links[key] ?? "";

    const showMsg = (text, kind) => {
      msg.textContent = text;
      msg.className = `field-msg${kind ? ` is-${kind}` : ""}`;
      if (kind === "error") input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    };

    // Clear a stale error as soon as the value becomes valid (no nagging while typing).
    input.addEventListener("input", () => {
      const v = input.value.trim();
      if (!v || isValidUrl(v)) showMsg("", "");
    });
    input.addEventListener("change", () => {
      const v = input.value.trim();
      if (v && !isValidUrl(v)) return showMsg(S.invalid, "error");
      input.value = v;
      const current = loadLinks(); // re-read: another field may have saved meanwhile
      if ((current[key] ?? "") === v) return;
      const ok = saveLinks(setLink(current, key, v));
      showMsg(ok ? S.saved : S.storageBlocked, ok ? "saved" : "error");
    });

    return el("div", { class: "field" },
      el("label", { for: id, class: "field-label" }, name),
      context && el("p", { class: "field-context" }, context),
      input,
      msg);
  }

  // --- Group: about you (the name for the greeting) ---
  const nameMsg = el("p", { class: "field-msg", id: "profile-name-msg", "aria-live": "polite" });
  const nameInput = el("input", {
    id: "profile-name", type: "text", autocomplete: "given-name", autocapitalize: "words",
    maxlength: String(MAX_NAME_LENGTH), placeholder: S.namePlaceholder, "aria-describedby": "profile-name-msg",
  });
  nameInput.value = loadProfile().name;
  nameInput.addEventListener("change", () => {
    const name = cleanName(nameInput.value);
    nameInput.value = name;
    if (name === loadProfile().name) return;
    const ok = saveProfile({ name });
    nameMsg.textContent = ok ? S.saved : S.storageBlocked;
    nameMsg.className = `field-msg is-${ok ? "saved" : "error"}`;
  });

  const profileGroup = group(S.profileGroup,
    el("div", { class: "card" },
      el("div", { class: "field" },
        el("label", { for: "profile-name", class: "field-label" }, S.nameLabel),
        el("p", { class: "field-context" }, S.nameHint),
        nameInput,
        nameMsg)));

  const pushGroup = group(S.pushGroup, pushCard(schedule));

  // --- Group: links ---
  const teacherFields = collectTeachers(classes).map((t) =>
    field(t.key, t.teacher, t.disciplines.join(", ")));

  const pairs = collectPairs(classes);
  const pairFields = pairs.map((p) => field(p.key, `${p.discipline} · ${p.type}`, p.teachers.join(", ")));
  const savedPairs = pairs.filter((p) => links[p.key]).length;

  // Per-class links are the exception, so they start collapsed.
  const pairsDetails = el("details", { class: "card disclosure" },
    el("summary", {},
      el("span", { class: "disclosure-title" }, S.pairsTitle),
      savedPairs > 0 && el("span", { class: "disclosure-count" }, S.pairsCount(savedPairs)),
      icon("expand_more", "20")),
    el("p", { class: "field-context section-hint" }, S.pairsHint),
    pairFields);

  const share = shareCard();
  const linksGroup = group(S.linksGroup,
    el("p", { class: "card card--compact device-note" }, icon("lock", "20"), el("span", {}, S.deviceOnly)),
    el("div", { class: "card" },
      el("h3", { class: "card-title" }, S.teachersTitle),
      el("p", { class: "field-context section-hint" }, S.teachersHint),
      teacherFields.length ? teacherFields : el("p", { class: "field-context" }, S.noSchedule)),
    pairFields.length > 0 && pairsDetails,
    share.card);
  // A link saved on this screen changes what gets shared. (The field saves first: its own
  // listener runs before this one, which only hears the event bubble up.)
  linksGroup.addEventListener("change", (e) => { if (e.target.matches("input[data-key]")) share.prepare(); });

  // --- Group: backup (import / export) ---
  const status = el("p", { class: "settings-status", "aria-live": "polite" }, message);
  const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true });

  const exportBtn = el("button", { type: "button", class: "btn btn--primary" }, icon("download"), S.export);
  exportBtn.addEventListener("click", async () => {
    const blob = new Blob([buildBackup(loadLinks(), await loadJoins())], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: S.exportFile(kyivParts(new Date()).date) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  const importBtn = el("button", { type: "button", class: "btn btn--secondary" }, icon("upload"), S.import);
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("backup: file too big");
      const { links: imported, joins } = parseBackup(await file.text());
      // Merge: imported links win, links not in the file are kept; stats are added without duplicates.
      if (!saveLinks({ ...loadLinks(), ...imported })) throw new Error("links: storage blocked");
      const newJoins = mergeJoins(await loadJoins(), joins);
      await addJoins(newJoins);
      const counts = [pluralize(Object.keys(imported).length, STRINGS.units.links)];
      if (newJoins.length) counts.push(pluralize(newJoins.length, STRINGS.units.records));
      renderSettings(container, schedule, { message: S.imported(counts.join(" · ")) });
    } catch (err) {
      console.warn(err);
      status.textContent = S.importError;
      status.className = "settings-status is-error";
    }
  });

  const backupGroup = group(S.backupGroup,
    el("div", { class: "card" },
      el("p", { class: "field-context section-hint" }, S.backupHint),
      el("div", { class: "settings-actions" }, exportBtn, importBtn, fileInput),
      status));

  // --- Credits: plain small text at the bottom, not a card ---
  const about = el("footer", { class: "about" },
    el("p", { class: "about-tagline" }, S.tagline),
    el("p", {}, S.author),
    el("ul", { class: "about-credits" },
      S.credits.map((c) => el("li", {},
        el("a", { href: c.href, target: "_blank", rel: "noopener noreferrer" }, c.text)))));

  container.replaceChildren(
    el("div", { class: "settings-top" },
      el("a", { class: "icon-btn", href: "#", "aria-label": S.back }, icon("arrow_back")),
      el("h1", { class: "settings-title", tabindex: "-1" }, S.title)),
    profileGroup,
    pushGroup,
    linksGroup,
    group(S.statsGroup, statsCard()),
    backupGroup,
    about,
  );

  // Focus the requested field (opening its section if collapsed), or the heading.
  const target = focusKey && [...container.querySelectorAll("[data-key]")].find((i) => i.dataset.key === focusKey);
  if (target) {
    const details = target.closest("details");
    if (details) details.open = true;
    target.focus();
    target.scrollIntoView({ block: "center" });
  } else {
    container.querySelector(".settings-title").focus();
    window.scrollTo(0, 0);
  }
}
