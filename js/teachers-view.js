// «Викладачі» (#teachers): everyone in the schedule, what they teach, and a one-tap letter
// once their email is added. Addresses are typed in by the
// student and stay on this device (contacts.js). Rendered when opened, not on the 15 s loop.

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { kyivParts, toMinutes, keepName } from "./format.js";
import { collectTeachers } from "./links.js";
import { loadContacts, saveContacts, setContact, isValidEmail, mailtoUrl } from "./contacts.js";

const T = STRINGS.teachers;

// PURE: the teacher's next class that hasn't ended yet, or null. Its subject goes in the letter.
export function nextClassWith(classes, teacher, today, nowMinutes) {
  return classes
    .filter((c) => c.teacher === teacher && (c.date > today || (c.date === today && toMinutes(c.end) > nowMinutes)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))[0] ?? null;
}

export function renderTeachers(container, { schedule, now }) {
  const { date: today, minutes: nowMinutes } = kyivParts(now);
  const classes = schedule?.classes ?? [];
  const teachers = collectTeachers(classes);
  let fieldCount = 0;

  function row(t) {
    const li = el("li", { class: "contact" });
    const name = keepName(t.teacher);
    const next = nextClassWith(classes, t.teacher, today, nowMinutes);
    // The letter's subject: the class coming up, or the first subject they teach.
    const discipline = next?.discipline ?? t.disciplines[0] ?? "";

    function build({ editing = false, message = "", kind = "" } = {}) {
      const email = loadContacts()[t.key] ?? "";
      const info = el("div", { class: "contact-text" },
        el("p", { class: "contact-name" }, name),
        el("p", { class: "contact-sub" }, t.disciplines.join(", ")));

      let action;
      if (email) {
        action = el("a", {
          class: "icon-btn icon-btn--soft", "aria-label": T.write(name),
          href: mailtoUrl(email, { subject: T.subject(discipline, schedule?.group ?? ""), body: T.body }),
        }, icon("mail"));
        // Tapping the address opens it for editing.
        const edit = el("button", { type: "button", class: "contact-email", "aria-label": T.edit(name) }, email);
        edit.addEventListener("click", () => build({ editing: true }));
        info.append(edit);
      } else {
        action = el("button", { type: "button", class: "chip chip--add", "aria-expanded": String(editing) },
          icon("add", "20"), T.addEmail);
        action.addEventListener("click", () => build({ editing: !editing }));
      }

      const parts = [info, action];
      if (editing) parts.push(editor(email));
      else if (message) parts.push(el("p", { class: `field-msg contact-msg is-${kind}`, "aria-live": "polite" }, message));
      li.replaceChildren(...parts);
      if (editing) li.querySelector("input").focus();
    }

    // One email input that saves itself when you leave it (or press Enter / «Готово»).
    function editor(email) {
      const id = `contact-${fieldCount++}`;
      const msg = el("p", { class: "field-msg", id: `${id}-msg`, "aria-live": "polite" });
      const input = el("input", {
        id, type: "email", inputmode: "email", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
        enterkeyhint: "done", placeholder: T.placeholder, "aria-describedby": `${id}-msg`,
      });
      input.value = email;
      const done = el("button", { type: "button", class: "btn btn--secondary contact-done" }, T.done);

      const showError = (text) => {
        msg.textContent = text;
        msg.className = "field-msg is-error";
        input.setAttribute("aria-invalid", "true");
      };
      input.addEventListener("input", () => {
        const v = input.value.trim();
        if (!v || isValidEmail(v)) { msg.textContent = ""; input.removeAttribute("aria-invalid"); }
      });

      let saving = false;
      function save() {
        if (saving) return;
        const v = input.value.trim();
        if (v && !isValidEmail(v)) return showError(T.invalid);
        const current = loadContacts();
        if ((current[t.key] ?? "") === v) return build();
        saving = true;
        if (!saveContacts(setContact(current, t.key, v))) { saving = false; return showError(T.storageBlocked); }
        build({ message: v ? T.saved : T.removed, kind: "saved" });
        // Keep keyboard users on this row.
        li.querySelector(".contact-email, .chip--add")?.focus();
      }
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
      input.addEventListener("change", save);
      done.addEventListener("click", save);

      return el("div", { class: "field contact-edit" },
        el("label", { for: id, class: "sr-only" }, T.emailLabel(name)),
        el("div", { class: "contact-edit-row" }, input, done),
        msg);
    }

    build();
    return li;
  }

  const body = teachers.length
    ? el("section", { class: "card" }, el("ul", { class: "contacts" }, teachers.map(row)))
    : el("p", { class: "card card--compact day-none" }, schedule ? T.empty : T.noSchedule);

  container.replaceChildren(
    el("div", { class: "settings-top tab-top" },
      el("h1", { class: "settings-title", tabindex: "-1" }, T.title)),
    body,
    el("p", { class: "foot" }, T.hint));
  container.querySelector(".settings-title").focus({ preventScroll: true });
}
