// Tasks and deadlines, stored only in this browser's localStorage.
// A task: { id, title, notes, discipline, due, done, doneAt, createdAt }
//   notes       "" or free text (pages, requirements, links); new lines are kept
//   discipline  "" or a subject name from the schedule
//   due         "" or "YYYY-MM-DD" (a Kyiv calendar day)
//   doneAt, createdAt  ISO timestamps ("" when not set)

import { addDays, toMinutes } from "./format.js";

export const STORAGE_KEY = "pary.tasks.v1";
export const MAX_TASKS = 500;
export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTES_LENGTH = 2000;
const MAX_TEXT_LENGTH = 300;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The home card and its count look this far ahead.
export const SOON_DAYS = 7;

// --- Pure helpers (tested) ---

const text = (value, max) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

export const cleanTitle = (value) => text(value, MAX_TITLE_LENGTH);

// Notes keep their line breaks; trailing spaces and runs of blank lines are tidied.
export function cleanNotes(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n")
    .trim().slice(0, MAX_NOTES_LENGTH).trim();
}

// Keeps well-formed tasks only, without duplicate ids, capped in number.
export function sanitizeTasks(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const t of list) {
    if (out.length >= MAX_TASKS) break;
    if (!t || typeof t !== "object") continue;
    const id = text(t.id, 64);
    const title = cleanTitle(t.title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title,
      notes: cleanNotes(t.notes),
      discipline: text(t.discipline, MAX_TEXT_LENGTH),
      due: typeof t.due === "string" && ISO_DATE.test(t.due) ? t.due : "",
      done: t.done === true,
      doneAt: t.done === true ? text(t.doneAt, 40) : "",
      createdAt: text(t.createdAt, 40),
    });
  }
  return out;
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function makeTask({ title, notes = "", discipline = "", due = "" }, now = new Date()) {
  return sanitizeTasks([{ id: newId(), title, notes, discipline, due, done: false, createdAt: now.toISOString() }])[0] ?? null;
}

// Changes some fields of one task. A blank title is ignored (the old one stays).
export function updateTask(tasks, id, patch) {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t, ...patch };
    if (!cleanTitle(next.title)) next.title = t.title;
    return sanitizeTasks([next])[0] ?? t;
  });
}

export const toggleTask = (tasks, id, now = new Date()) =>
  tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? "" : now.toISOString() } : t));

export const removeTask = (tasks, id) => tasks.filter((t) => t.id !== id);
export const clearDone = (tasks) => tasks.filter((t) => !t.done);

// Imported tasks win over ones with the same id; the rest are kept.
export function mergeTasks(existing, incoming) {
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const t of incoming) byId.set(t.id, t);
  return sanitizeTasks([...byId.values()]);
}

// Earliest due first; no date last; then oldest first.
const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.createdAt.localeCompare(b.createdAt);

// The task list in sections, each sorted. today: "YYYY-MM-DD" (Kyiv).
export function groupTasks(tasks, today) {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, SOON_DAYS);
  const groups = { overdue: [], today: [], tomorrow: [], week: [], later: [], noDate: [], done: [] };
  for (const t of tasks) {
    if (t.done) groups.done.push(t);
    else if (!t.due) groups.noDate.push(t);
    else if (t.due < today) groups.overdue.push(t);
    else if (t.due === today) groups.today.push(t);
    else if (t.due === tomorrow) groups.tomorrow.push(t);
    else if (t.due <= weekEnd) groups.week.push(t);
    else groups.later.push(t);
  }
  for (const [name, list] of Object.entries(groups)) {
    if (name === "done") list.sort((a, b) => b.doneAt.localeCompare(a.doneAt));
    else list.sort(byDue);
  }
  return groups;
}

// For the home card: open tasks due within SOON_DAYS (overdue included), earliest first.
// null when there's nothing to say.
export function dueSoon(tasks, today) {
  const weekEnd = addDays(today, SOON_DAYS);
  const soon = tasks.filter((t) => !t.done && t.due && t.due <= weekEnd).sort(byDue);
  if (soon.length === 0) return null;
  return { count: soon.length, overdue: soon.filter((t) => t.due < today).length, next: soon[0] };
}

// Subjects with an open task due on `date`, for the marker on class rows.
export function dueOn(tasks, date) {
  return new Set(tasks.filter((t) => !t.done && t.due === date && t.discipline).map((t) => t.discipline));
}

// «До наступної пари»: the date of the next class of this subject that hasn't started yet.
// nowMinutes: minutes since midnight in Kyiv. "" if the schedule has none.
export function nextClassDate(classes, discipline, today, nowMinutes) {
  const next = classes
    .filter((c) => c.discipline === discipline &&
      (c.date > today || (c.date === today && toMinutes(c.start) > nowMinutes)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))[0];
  return next?.date ?? "";
}

// --- Storage ---

export function loadTasks() {
  try {
    return sanitizeTasks(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return []; // private mode, blocked storage or broken JSON: behave as "no tasks"
  }
}

// Returns false if storage is unavailable, so the UI can say so.
export function saveTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeTasks(tasks)));
    return true;
  } catch {
    return false;
  }
}
