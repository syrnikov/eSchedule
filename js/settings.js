// Settings screen, built from groups (Про тебе · Нагадування · Посилання · Резервна копія)
// plus a small credits footer.
// To add a setting later, add another group(...) in renderSettings.
// Rendered once when opened (not on the 15 s loop, so typing is never interrupted).

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { kyivParts, pluralize } from "./format.js";
import {
  loadLinks, saveLinks, setLink, isValidUrl, collectPairs, collectTeachers, parseImport, exportJson,
} from "./links.js";
import { loadProfile, saveProfile, cleanName, MAX_NAME_LENGTH } from "./profile.js";
import { pushSupport, loadPushPrefs, applyPush, groupKey, wantsPush, LEADS } from "./push.js";
import { ALARM_REGION } from "./config.js";

const S = STRINGS.settingsView;
const MAX_IMPORT_BYTES = 100_000;

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

  const linksGroup = group(S.linksGroup,
    el("p", { class: "card card--compact device-note" }, icon("lock", "20"), el("span", {}, S.deviceOnly)),
    el("div", { class: "card" },
      el("h3", { class: "card-title" }, S.teachersTitle),
      el("p", { class: "field-context section-hint" }, S.teachersHint),
      teacherFields.length ? teacherFields : el("p", { class: "field-context" }, S.noSchedule)),
    pairFields.length > 0 && pairsDetails);

  // --- Group: backup (import / export) ---
  const status = el("p", { class: "settings-status", "aria-live": "polite" }, message);
  const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true });

  const exportBtn = el("button", { type: "button", class: "btn btn--primary" }, icon("download"), S.export);
  exportBtn.addEventListener("click", () => {
    const blob = new Blob([exportJson(loadLinks())], { type: "application/json" });
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
      if (file.size > MAX_IMPORT_BYTES) throw new Error("links: file too big");
      const imported = parseImport(await file.text());
      // Merge: imported links win, links not in the file are kept.
      if (!saveLinks({ ...loadLinks(), ...imported })) throw new Error("links: storage blocked");
      const count = pluralize(Object.keys(imported).length, STRINGS.units.links);
      renderSettings(container, schedule, { message: S.imported(count) });
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
