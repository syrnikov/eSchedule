// Settings screen: one URL field per discipline+type, teacher fallbacks, import/export.
// Rendered once when opened (not on the 15 s loop, so typing is never interrupted).

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { kyivParts, pluralize } from "./format.js";
import {
  loadLinks, saveLinks, setLink, isValidUrl, collectPairs, collectTeachers, parseImport, exportJson,
} from "./links.js";

const S = STRINGS.settingsView;
const MAX_IMPORT_BYTES = 100_000;

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

  const pairs = collectPairs(classes).map((p) =>
    field(p.key, `${p.discipline} · ${p.type}`, p.teachers.join(", ")));
  const teachers = collectTeachers(classes).map((t) =>
    field(t.key, t.teacher, t.disciplines.join(", ")));

  // --- Import / export ---
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

  container.replaceChildren(
    el("div", { class: "settings-top" },
      el("a", { class: "icon-btn", href: "#", "aria-label": S.back }, icon("arrow_back")),
      el("h1", { class: "settings-title", tabindex: "-1" }, S.title)),
    el("p", { class: "card card--compact device-note" }, icon("lock", "20"), el("span", {}, S.deviceOnly)),
    el("section", { class: "card" },
      el("h2", { class: "card-title" }, S.pairsTitle),
      pairs.length ? pairs : el("p", { class: "field-context" }, S.noSchedule)),
    teachers.length > 0 && el("section", { class: "card" },
      el("h2", { class: "card-title" }, S.teachersTitle),
      el("p", { class: "field-context section-hint" }, S.teachersHint),
      teachers),
    el("section", { class: "settings-actions" }, exportBtn, importBtn, fileInput),
    status,
  );

  // Focus the requested field, or the heading so screen readers announce the screen.
  const target = focusKey && [...container.querySelectorAll("input[data-key]")].find((i) => i.dataset.key === focusKey);
  if (target) {
    target.focus();
    target.scrollIntoView({ block: "center" });
  } else {
    container.querySelector(".settings-title").focus();
    window.scrollTo(0, 0);
  }
}
