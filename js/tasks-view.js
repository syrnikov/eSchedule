// «Завдання» (#tasks): a quick-add card, then open tasks by when they're due, then the done
// ones (collapsed). Rendered when opened, and again only after a change made here, so typing
// is never interrupted by the 15 s loop.

import { STRINGS } from "./strings.js";
import { el, icon } from "./dom.js";
import { kyivParts, addDays, weekdayOf, formatIsoDayMonth, pluralize } from "./format.js";
import { joinDot } from "./class-row.js";
import {
  loadTasks, saveTasks, makeTask, toggleTask, removeTask, updateTask, clearDone, groupTasks, nextClassDate,
  cleanTitle, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH,
} from "./tasks.js";

const T = STRINGS.tasks;
const OPEN_SECTIONS = ["overdue", "today", "tomorrow", "week", "later", "noDate"];

// When a task is due, as words: "сьогодні", "завтра", "в четвер", "12 жовтня", "було на 3 жовтня".
export function dueText(due, today) {
  if (!due) return "";
  if (due < today) return T.wasDue(formatIsoDayMonth(due));
  if (due === today) return T.when.today;
  if (due === addDays(today, 1)) return T.when.tomorrow;
  if (due <= addDays(today, 6)) return STRINGS.weekdayOn[weekdayOf(due)];
  return formatIsoDayMonth(due);
}

// A second tap within 5 s does it; otherwise the button goes back to normal.
// (No browser confirm() dialogs in this app.)
function twoTap(button, { arm, disarm, run }) {
  let timer = null;
  button.addEventListener("click", () => {
    if (!timer) {
      arm();
      timer = setTimeout(() => { timer = null; disarm(); }, 5000);
      return;
    }
    clearTimeout(timer);
    timer = null;
    run();
  });
}

export function renderTasks(container, { schedule, now }) {
  const { date: today, minutes: nowMinutes } = kyivParts(now);
  const classes = schedule?.classes ?? [];
  const disciplines = [...new Set(classes.map((c) => c.discipline))].sort((a, b) => a.localeCompare(b, "uk"));

  const status = el("p", { class: "sr-only", "aria-live": "polite" });
  const say = (text) => { status.textContent = text; };
  const list = el("div", { class: "task-sections" });

  // --- Quick add: just the title at first; subject and due date appear once there's text ---
  const titleInput = el("input", {
    id: "task-title", type: "text", autocomplete: "off", enterkeyhint: "done",
    maxlength: String(MAX_TITLE_LENGTH), placeholder: T.placeholder,
  });
  const addBtn = el("button", { type: "submit", class: "task-add-btn", "aria-label": T.add, disabled: true }, icon("add"));
  const msg = el("p", { class: "field-msg", "aria-live": "polite" });

  const subject = el("select", { id: "task-subject", class: "select" },
    el("option", { value: "" }, T.noSubject),
    disciplines.map((d) => el("option", { value: d }, d)));

  // Due chips: one or none pressed. «До пари» needs a subject with a class ahead.
  const dateInput = el("input", { type: "date", class: "task-date", "aria-label": T.dateLabel, min: today, hidden: true });
  const chips = [
    { key: "today", label: T.dueToday },
    { key: "tomorrow", label: T.dueTomorrow },
    { key: "next", label: T.dueNextClass },
    { key: "date", label: T.dueDate },
  ].map((c) => ({ ...c, button: el("button", { type: "button", class: "chip", "aria-pressed": "false" }, c.label) }));
  let dueKey = "";
  const dueHint = el("p", { class: "field-context task-due-hint" });

  const nextDate = () => (subject.value ? nextClassDate(classes, subject.value, today, nowMinutes) : "");
  const dueValue = () => ({
    today, tomorrow: addDays(today, 1), next: nextDate(), date: dateInput.value,
  })[dueKey] ?? "";

  function showDue() {
    const nextChip = chips.find((c) => c.key === "next").button;
    nextChip.hidden = !nextDate();
    if (dueKey === "next" && nextChip.hidden) dueKey = "";
    for (const c of chips) c.button.setAttribute("aria-pressed", String(c.key === dueKey));
    dateInput.hidden = dueKey !== "date";
    const due = dueValue();
    dueHint.textContent = due ? joinDot(T.dueLabel, dueText(due, today)) : T.dueNone;
  }
  for (const c of chips) {
    c.button.addEventListener("click", () => {
      dueKey = dueKey === c.key ? "" : c.key;
      showDue();
      if (dueKey === "date") dateInput.showPicker?.();
    });
  }
  subject.addEventListener("change", showDue);
  dateInput.addEventListener("change", showDue);

  const notesInput = el("textarea", {
    id: "task-notes", rows: "3", maxlength: String(MAX_NOTES_LENGTH), placeholder: T.notesPlaceholder,
  });

  const options = el("div", { class: "task-options", hidden: true },
    el("div", { class: "field" },
      el("label", { for: "task-notes", class: "field-label" }, T.notesLabel),
      notesInput),
    disciplines.length > 0 && el("div", { class: "field" },
      el("label", { for: "task-subject", class: "field-label" }, T.subjectLabel),
      subject),
    el("div", { class: "field" },
      el("p", { class: "field-label" }, T.dueLabel),
      el("div", { class: "chips" }, chips.map((c) => c.button)),
      dateInput,
      dueHint));

  titleInput.addEventListener("input", () => {
    const has = Boolean(cleanTitle(titleInput.value));
    addBtn.disabled = !has;
    if (has) options.hidden = false;
    msg.textContent = "";
  });

  const form = el("form", { class: "card task-add", novalidate: true },
    el("label", { for: "task-title", class: "card-title" }, T.titleLabel),
    el("div", { class: "task-add-row" }, titleInput, addBtn),
    msg,
    options);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const task = makeTask({
      title: titleInput.value, notes: notesInput.value, discipline: subject.value, due: dueValue(),
    }, now);
    if (!task) return;
    if (!saveTasks([...loadTasks(), task])) {
      msg.textContent = T.storageBlocked;
      msg.className = "field-msg is-error";
      return;
    }
    say(T.added(task.title));
    form.reset();
    dueKey = "";
    showDue();
    addBtn.disabled = true;
    options.hidden = true;
    renderList();
    titleInput.focus(); // ready for the next one
  });
  showDue();

  // --- The list ---
  let openId = null; // the task opened for editing (one at a time)

  function update(next, focusId, focusSelector = ".task-check") {
    if (!saveTasks(next)) return say(T.storageBlocked);
    renderList();
    const target = focusId && list.querySelector(`[data-id="${CSS.escape(focusId)}"] ${focusSelector}`);
    target?.focus();
  }

  // Title and notes of an opened task. Each field saves itself when you leave it, without
  // rebuilding the list (that would steal the focus); «Готово» saves and closes.
  function editor(task) {
    const id = `task-edit-${task.id}`;
    const name = el("input", { id: `${id}-name`, type: "text", autocomplete: "off", maxlength: String(MAX_TITLE_LENGTH) });
    name.value = task.title;
    const notes = el("textarea", {
      id: `${id}-notes`, rows: "4", maxlength: String(MAX_NOTES_LENGTH), placeholder: T.notesPlaceholder,
    });
    notes.value = task.notes;

    const save = () => {
      if (!saveTasks(updateTask(loadTasks(), task.id, { title: name.value, notes: notes.value }))) say(T.storageBlocked);
    };
    name.addEventListener("change", save);
    notes.addEventListener("change", save);
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); notes.focus(); } });

    const done = el("button", { type: "button", class: "btn btn--primary" }, T.editDone);
    done.addEventListener("click", () => {
      save();
      openId = null;
      renderList();
      list.querySelector(`[data-id="${CSS.escape(task.id)}"] .task-open`)?.focus();
    });

    const remove = el("button", { type: "button", class: "btn btn--secondary" }, icon("delete", "20"), T.delete);
    twoTap(remove, {
      arm: () => { remove.lastChild.textContent = T.deleteConfirm; remove.classList.add("btn--danger"); },
      disarm: () => { remove.lastChild.textContent = T.delete; remove.classList.remove("btn--danger"); },
      run: () => { openId = null; say(T.remove(task.title)); update(removeTask(loadTasks(), task.id)); },
    });

    return el("div", { class: "task-edit" },
      el("div", { class: "field" },
        el("label", { for: name.id, class: "field-label" }, T.nameLabel),
        name),
      el("div", { class: "field" },
        el("label", { for: notes.id, class: "field-label" }, T.notesLabel),
        notes),
      el("div", { class: "settings-actions" }, done, remove));
  }

  function taskRow(task, section) {
    const check = el("button", {
      type: "button", class: "task-check", "aria-pressed": String(task.done),
      "aria-label": task.done ? T.markOpen(task.title) : T.markDone(task.title),
    }, icon(task.done ? "check_circle" : "radio_button_unchecked"));
    check.addEventListener("click", () => {
      say(task.done ? T.markOpen(task.title) : T.markDone(task.title));
      update(toggleTask(loadTasks(), task.id, new Date()), task.id);
    });

    // Today / tomorrow already say when in the section title.
    const when = section === "today" || section === "tomorrow" ? "" : dueText(task.due, today);
    const sub = joinDot(task.discipline, when);

    let remove = null;
    if (task.done) {
      remove = el("button", { type: "button", class: "task-remove", "aria-label": T.remove(task.title) }, icon("delete", "20"));
      twoTap(remove, {
        arm: () => { remove.classList.add("is-armed"); remove.setAttribute("aria-label", T.removeConfirm(task.title)); },
        disarm: () => { remove.classList.remove("is-armed"); remove.setAttribute("aria-label", T.remove(task.title)); },
        run: () => update(removeTask(loadTasks(), task.id)),
      });
    }

    // The text is one button: it opens the task to edit its title and notes.
    const editing = openId === task.id;
    const open = el("button", { type: "button", class: "task-open", "aria-expanded": String(editing) },
      el("span", { class: "task-title" }, task.title),
      sub && el("span", { class: "task-sub" }, sub),
      task.notes && !editing && el("span", { class: "task-notes" }, task.notes));
    open.addEventListener("click", () => {
      openId = editing ? null : task.id;
      renderList();
      const row = list.querySelector(`[data-id="${CSS.escape(task.id)}"]`);
      (openId ? row?.querySelector("textarea") : row?.querySelector(".task-open"))?.focus();
    });

    return el("li", { class: `task${task.done ? " is-done" : ""}${section === "overdue" ? " is-overdue" : ""}`, "data-id": task.id },
      check,
      open,
      remove ?? el("span"),
      editing && editor(task));
  }

  function renderList() {
    const tasks = loadTasks();
    const groups = groupTasks(tasks, today);
    const sections = OPEN_SECTIONS.filter((name) => groups[name].length).map((name) =>
      el("section", { class: `card task-section task-section--${name}` },
        el("h2", { class: "card-title" }, T.sections[name]),
        el("ul", { class: "tasks" }, groups[name].map((t) => taskRow(t, name)))));

    const parts = sections.length ? sections
      : [el("p", { class: "card card--compact day-none" }, groups.done.length ? T.allDone : T.empty)];

    if (groups.done.length) {
      const clear = el("button", { type: "button", class: "btn btn--secondary btn--wide" }, T.clearDone);
      twoTap(clear, {
        arm: () => { clear.textContent = T.clearConfirm; clear.classList.add("btn--danger"); },
        disarm: () => { clear.textContent = T.clearDone; clear.classList.remove("btn--danger"); },
        run: () => update(clearDone(loadTasks())),
      });
      const wasOpen = list.querySelector(".task-done")?.open ?? false;
      const done = el("details", { class: "card disclosure task-done" },
        el("summary", {},
          el("span", { class: "disclosure-title" }, T.done),
          el("span", { class: "disclosure-count" }, String(groups.done.length)),
          icon("expand_more", "20")),
        el("ul", { class: "tasks" }, groups.done.map((t) => taskRow(t, "done"))),
        el("div", { class: "stats-actions" }, clear));
      done.open = wasOpen;
      parts.push(done);
    }

    parts.push(el("p", { class: "foot" }, T.deviceOnly));
    list.replaceChildren(...parts);
  }
  renderList();

  container.replaceChildren(
    el("div", { class: "settings-top tab-top" },
      el("h1", { class: "settings-title", tabindex: "-1" }, T.title)),
    form,
    list,
    status);
  container.querySelector(".settings-title").focus({ preventScroll: true });
}

// "2 завдання найближчим часом" for the home card, with the nearest one.
export function deadlineLines(soon, today) {
  const D = STRINGS.deadlines;
  return {
    line: D.line(pluralize(soon.count, STRINGS.units.tasks)),
    sub: D.next(dueText(soon.next.due, today), soon.next.title),
  };
}
