// «Профіль» (#profile), opened by the avatar on the home screen: the student's own things.
//   Про тебе         the name for the greeting
//   Резервна копія   export / import of everything stored on this device
// App settings (reminders, links, sharing) stay behind the gear (settings.js).
// Rendered once when opened (not on the 15 s loop, so typing is never interrupted).

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { kyivParts, pluralize } from "./format.js";
import { loadLinks, saveLinks } from "./links.js";
import { buildBackup, parseBackup } from "./backup.js";
import { loadContacts, saveContacts } from "./contacts.js";
import { loadTasks, saveTasks, mergeTasks } from "./tasks.js";
import { loadJoins, addJoins, mergeJoins } from "./stats.js";
import { loadProfile, saveProfile, cleanName, initialOf, MAX_NAME_LENGTH } from "./profile.js";
import { accentIndex } from "./voice.js";
import { group } from "./settings.js";

const S = STRINGS.settingsView;
const P = STRINGS.profileView;
const MAX_IMPORT_BYTES = 2_000_000; // links + up to MAX_JOINS stats records

// The round avatar: the name's initial on its accent colour, or a person icon without a name.
// Also the home screen's top-left button (main.js puts it inside a link).
export function avatar(name, extraClass = "") {
  const letter = initialOf(name);
  return el("span", {
    class: `avatar${extraClass ? ` ${extraClass}` : ""}`,
    "data-accent": letter ? accentIndex(name) : null,
    "aria-hidden": "true",
  }, letter || icon("person"));
}

export function renderProfile(container, { message = "" } = {}) {
  const big = avatar(loadProfile().name, "avatar--big");
  const title = el("h1", { class: "settings-title", tabindex: "-1" }, loadProfile().name || P.title);

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
    if (ok) {
      big.replaceWith(avatar(name, "avatar--big"));
      title.textContent = name || P.title;
    }
  });

  const profileGroup = group(S.profileGroup,
    el("div", { class: "card" },
      el("div", { class: "field" },
        el("label", { for: "profile-name", class: "field-label" }, S.nameLabel),
        el("p", { class: "field-context" }, S.nameHint),
        nameInput,
        nameMsg)));

  // --- Group: backup (import / export) ---
  const status = el("p", { class: "settings-status", "aria-live": "polite" }, message);
  const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true });

  const exportBtn = el("button", { type: "button", class: "btn btn--primary" }, icon("download"), S.export);
  exportBtn.addEventListener("click", async () => {
    const backup = buildBackup(loadLinks(), await loadJoins(), { contacts: loadContacts(), tasks: loadTasks() });
    const blob = new Blob([backup], { type: "application/json" });
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
      const { links: imported, joins, contacts, tasks } = parseBackup(await file.text());
      // Merge: imported links, emails and tasks win, ones not in the file are kept; stats are
      // added without duplicates.
      if (!saveLinks({ ...loadLinks(), ...imported })) throw new Error("links: storage blocked");
      if (!saveContacts({ ...loadContacts(), ...contacts })) throw new Error("contacts: storage blocked");
      if (!saveTasks(mergeTasks(loadTasks(), tasks))) throw new Error("tasks: storage blocked");
      const newJoins = mergeJoins(await loadJoins(), joins);
      await addJoins(newJoins);
      const counts = [];
      const linkCount = Object.keys(imported).length;
      const emailCount = Object.keys(contacts).length;
      if (linkCount || (!emailCount && !tasks.length && !newJoins.length)) counts.push(pluralize(linkCount, STRINGS.units.links));
      if (emailCount) counts.push(pluralize(emailCount, STRINGS.units.emails));
      if (tasks.length) counts.push(pluralize(tasks.length, STRINGS.units.tasks));
      if (newJoins.length) counts.push(pluralize(newJoins.length, STRINGS.units.records));
      renderProfile(container, { message: S.imported(counts.join(" · ")) });
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

  container.replaceChildren(
    el("div", { class: "settings-top" },
      el("a", { class: "icon-btn", href: "#", "aria-label": S.back }, icon("arrow_back"))),
    el("div", { class: "profile-head" }, big, title),
    profileGroup,
    backupGroup,
  );
  title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
