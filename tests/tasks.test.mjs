// Tasks and teachers' emails: the pure parts (tasks.js, contacts.js, the bits of the views
// that don't touch the DOM) and emails travelling in a share.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeTasks, makeTask, toggleTask, removeTask, updateTask, clearDone, mergeTasks, groupTasks, dueSoon, dueOn,
  nextClassDate, cleanNotes, MAX_TASKS, MAX_TITLE_LENGTH, MAX_NOTES_LENGTH,
} from "../js/tasks.js";
import { isValidEmail, sanitizeContacts, mailtoUrl, setContact } from "../js/contacts.js";
import { dueText, deadlineLines } from "../js/tasks-view.js";
import { nextClassWith } from "../js/teachers-view.js";
import { encodeShare, decodeShare, decodeSharePayload, diffContacts } from "../js/share.js";

const TODAY = "2026-10-01"; // a Thursday
const task = (id, fields = {}) => ({
  id, title: `Task ${id}`, notes: "", discipline: "", due: "", done: false, doneAt: "", createdAt: `2026-09-2${id.length}T08:00:00.000Z`,
  ...fields,
});

// --- tasks.js ---

test("sanitizeTasks keeps good tasks, fixes what it can, drops the rest", () => {
  const out = sanitizeTasks([
    task("a", { title: "  Звіт   з ІТ  ", due: "2026-10-03" }),
    task("a", { title: "duplicate id" }),
    task("b", { due: "next week", done: "yes", doneAt: "2026-09-30" }),
    { id: "c", title: "" },
    { title: "no id" },
    null,
    "junk",
    task("d", { title: "x".repeat(MAX_TITLE_LENGTH + 50) }),
  ]);
  assert.deepEqual(out.map((t) => t.id), ["a", "b", "d"]);
  assert.equal(out[0].title, "Звіт з ІТ");
  assert.equal(out[1].due, "");
  assert.equal(out[1].done, false);
  assert.equal(out[1].doneAt, "", "doneAt only for done tasks");
  assert.equal(out[2].title.length, MAX_TITLE_LENGTH);
  assert.deepEqual(sanitizeTasks({ not: "an array" }), []);
  assert.equal(sanitizeTasks(Array.from({ length: MAX_TASKS + 5 }, (_, i) => task(`t${i}`))).length, MAX_TASKS);
});

test("makeTask, toggle, remove, clear done, merge", () => {
  const now = new Date("2026-10-01T07:00:00Z");
  const a = makeTask({ title: "Есе", discipline: "Філософія", due: "2026-10-05" }, now);
  assert.ok(a.id);
  assert.equal(a.createdAt, now.toISOString());
  assert.equal(makeTask({ title: "   " }, now), null);

  const done = toggleTask([a], a.id, now);
  assert.equal(done[0].done, true);
  assert.equal(done[0].doneAt, now.toISOString());
  assert.equal(toggleTask(done, a.id, now)[0].doneAt, "");

  assert.deepEqual(removeTask(done, a.id), []);
  assert.deepEqual(clearDone([...done, task("b")]).map((t) => t.id), ["b"]);
  const merged = mergeTasks([task("a"), task("b")], [task("b", { title: "new" }), task("c")]);
  assert.deepEqual(merged.map((t) => [t.id, t.title]), [["a", "Task a"], ["b", "new"], ["c", "Task c"]]);
});

test("notes keep their line breaks, tidied and capped", () => {
  assert.equal(cleanNotes("  Варіант 7  \r\nс. 12–15\n\n\n\nздати в Moodle "), "Варіант 7\nс. 12–15\n\nздати в Moodle");
  assert.equal(cleanNotes(42), "");
  assert.equal(cleanNotes("x".repeat(MAX_NOTES_LENGTH + 10)).length, MAX_NOTES_LENGTH);
  const [t] = sanitizeTasks([task("a", { notes: "  рядок 1\nрядок 2  " })]);
  assert.equal(t.notes, "рядок 1\nрядок 2");
  assert.equal(sanitizeTasks([{ id: "b", title: "No notes field" }])[0].notes, "");
  assert.equal(makeTask({ title: "Есе", notes: "2 сторінки" }).notes, "2 сторінки");
});

test("updateTask edits title and notes; a blank title keeps the old one", () => {
  const tasks = [task("a"), task("b")];
  const edited = updateTask(tasks, "a", { title: "  Нова назва ", notes: "деталі" });
  assert.deepEqual([edited[0].title, edited[0].notes], ["Нова назва", "деталі"]);
  assert.equal(edited[1], tasks[1], "other tasks untouched");
  assert.equal(updateTask(tasks, "a", { title: "   " })[0].title, "Task a");
});

test("groupTasks: sections by due date, sorted, done newest first", () => {
  const tasks = [
    task("late", { due: "2026-09-29" }),
    task("today", { due: TODAY }),
    task("tmr", { due: "2026-10-02" }),
    task("wk2", { due: "2026-10-08" }), // exactly 7 days ahead: still this week
    task("wk1", { due: "2026-10-04" }),
    task("later", { due: "2026-10-09" }),
    task("nodate"),
    task("d1", { done: true, doneAt: "2026-09-30T10:00:00Z", due: TODAY }),
    task("d2", { done: true, doneAt: "2026-10-01T06:00:00Z" }),
  ];
  const g = groupTasks(tasks, TODAY);
  const ids = (list) => list.map((t) => t.id);
  assert.deepEqual(ids(g.overdue), ["late"]);
  assert.deepEqual(ids(g.today), ["today"]);
  assert.deepEqual(ids(g.tomorrow), ["tmr"]);
  assert.deepEqual(ids(g.week), ["wk1", "wk2"]);
  assert.deepEqual(ids(g.later), ["later"]);
  assert.deepEqual(ids(g.noDate), ["nodate"]);
  assert.deepEqual(ids(g.done), ["d2", "d1"]);
});

test("groupTasks: tomorrow across a month end", () => {
  const g = groupTasks([task("x", { due: "2026-11-01" })], "2026-10-31");
  assert.equal(g.tomorrow.length, 1);
});

test("dueSoon: only open tasks within a week, overdue counted, nearest first", () => {
  assert.equal(dueSoon([task("a"), task("b", { due: "2026-10-20" })], TODAY), null);
  assert.equal(dueSoon([task("a", { due: TODAY, done: true })], TODAY), null);
  const soon = dueSoon([
    task("wk", { due: "2026-10-05" }),
    task("late", { due: "2026-09-30" }),
    task("far", { due: "2026-10-20" }),
  ], TODAY);
  assert.deepEqual({ count: soon.count, overdue: soon.overdue, next: soon.next.id }, { count: 2, overdue: 1, next: "late" });
});

test("dueOn: subjects with an open task due that day", () => {
  const set = dueOn([
    task("a", { due: TODAY, discipline: "Трактори" }),
    task("b", { due: TODAY, discipline: "Філософія", done: true }),
    task("c", { due: TODAY }),
    task("d", { due: "2026-10-02", discipline: "Економіка" }),
  ], TODAY);
  assert.deepEqual([...set], ["Трактори"]);
});

test("nextClassDate: the next class of the subject that hasn't started", () => {
  const classes = [
    { date: TODAY, start: "08:15", end: "09:35", discipline: "Трактори" },
    { date: "2026-10-06", start: "09:45", end: "11:05", discipline: "Трактори" },
    { date: "2026-10-02", start: "08:15", end: "09:35", discipline: "Філософія" },
  ];
  assert.equal(nextClassDate(classes, "Трактори", TODAY, 7 * 60), TODAY); // 07:00: still ahead
  assert.equal(nextClassDate(classes, "Трактори", TODAY, 9 * 60), "2026-10-06"); // already started
  assert.equal(nextClassDate(classes, "Хімія", TODAY, 0), "");
});

// --- tasks-view.js (words) ---

test("dueText: today, tomorrow, weekday, date, and gently for the past", () => {
  assert.equal(dueText("", TODAY), "");
  assert.equal(dueText(TODAY, TODAY), "сьогодні");
  assert.equal(dueText("2026-10-02", TODAY), "завтра");
  assert.equal(dueText("2026-10-05", TODAY), "в понеділок");
  assert.equal(dueText("2026-10-12", TODAY), "12 жовтня");
  assert.equal(dueText("2026-09-29", TODAY), "було на 29 вересня");
});

test("deadlineLines: count and the nearest task", () => {
  const soon = dueSoon([task("a", { title: "Звіт з ІТ", due: "2026-10-02" }), task("b", { due: "2026-10-05" })], TODAY);
  assert.deepEqual(deadlineLines(soon, TODAY), {
    line: "2 завдання найближчим часом", // pluralize keeps the number and unit together
    sub: "Найближче — завтра: Звіт з ІТ",
  });
});

// --- contacts.js ---

test("isValidEmail accepts normal addresses and nothing that breaks a mailto:", () => {
  for (const ok of ["nasakina@osau.edu.ua", "a.b+c@mail.example.com", "x@y.co"]) assert.ok(isValidEmail(ok), ok);
  for (const bad of [
    "", "plain", "a@b", "a@b.c", "two@@x.ua", "sp ace@x.ua", "a@x.ua?cc=evil@x.ua", "a@x.ua&body=x",
    "<a@x.ua>", "a@x.ua#frag", "a,b@x.ua", `${"a".repeat(250)}@x.ua`, null, 42,
  ]) {
    assert.ok(!isValidEmail(bad), String(bad));
  }
});

test("sanitizeContacts keeps teacher keys with valid emails only", () => {
  assert.deepEqual(sanitizeContacts({
    "@Насакіна С. В.": " nasakina@osau.edu.ua ",
    "@Bad": "nope",
    "Трактори|Лекції": "a@x.ua",
    "@": "a@x.ua",
  }), { "@Насакіна С. В.": "nasakina@osau.edu.ua" });
  assert.deepEqual(sanitizeContacts([1]), {});
  assert.deepEqual(setContact({ "@A": "a@x.ua" }, "@A", ""), {});
});

test("mailtoUrl encodes Cyrillic subjects and new lines", () => {
  const url = mailtoUrl("nasakina@osau.edu.ua", { subject: "Трактори · 208-бак", body: "Добрий день!\n\n" });
  assert.ok(url.startsWith("mailto:nasakina@osau.edu.ua?subject="));
  const params = new URLSearchParams(url.split("?")[1].replace(/\+/g, "%2B"));
  assert.equal(params.get("subject"), "Трактори · 208-бак");
  assert.equal(params.get("body"), "Добрий день!\n\n");
  assert.doesNotMatch(url, /[\s]/);
  assert.equal(mailtoUrl("a@x.ua"), "mailto:a@x.ua");
});

// --- teachers-view.js ---

test("nextClassWith: a class still running counts, a finished one doesn't", () => {
  const classes = [
    { date: TODAY, start: "08:15", end: "09:35", teacher: "Насакіна С. В.", discipline: "Трактори" },
    { date: "2026-10-03", start: "08:15", end: "09:35", teacher: "Насакіна С. В.", discipline: "Економіка" },
  ];
  assert.equal(nextClassWith(classes, "Насакіна С. В.", TODAY, 9 * 60).date, TODAY);
  assert.equal(nextClassWith(classes, "Насакіна С. В.", TODAY, 10 * 60).discipline, "Економіка");
  assert.equal(nextClassWith(classes, "Хтось", TODAY, 0), null);
});

// --- Emails in a share ---

test("share: emails travel with links; old links-only shares are unchanged", async () => {
  const links = { "@Насакіна С. В.": "https://zoom.us/j/1" };
  const contacts = { "@Насакіна С. В.": "nasakina@osau.edu.ua" };
  assert.equal(await encodeShare(links, {}), await encodeShare(links), "no contacts: same fragment as before");

  const both = await encodeShare(links, contacts);
  assert.deepEqual(await decodeSharePayload(both), { links, contacts });
  assert.deepEqual(await decodeShare(both), links);

  // Emails alone are a valid share too; bad ones are dropped.
  const onlyEmails = await encodeShare({}, { ...contacts, "@Bad": "nope", "Трактори|Лекції": "a@x.ua" });
  assert.deepEqual(await decodeSharePayload(onlyEmails), { links: {}, contacts });
});

test("diffContacts: new, replace, same", () => {
  const diff = diffContacts({ "@Б": "b@x.ua", "@А": "a@x.ua", "@В": "v@x.ua" }, { "@А": "old@x.ua", "@В": "v@x.ua" });
  assert.deepEqual(diff.map((d) => [d.key, d.status, d.kind]), [
    ["@А", "replace", "email"], ["@Б", "new", "email"], ["@В", "same", "email"],
  ]);
});
