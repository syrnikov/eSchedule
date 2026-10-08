// Local stats: one record per «Приєднатися» tap, in IndexedDB on this device only.
// A tap is not proof of attendance, so the UI only ever says what was tapped, never
// "attendance", never percentages, never anything about missed classes.
//
// Record: { at: ISO time, date: "2026-09-28", start: "08:15", discipline, teacher, type,
//           minutes: tap time relative to class start (negative = early), alert: boolean }

import { kyivLocalToDate, addDays, weekdayOf } from "./format.js";

const DB_NAME = "pary";
const STORE = "joins";
export const MAX_JOINS = 5000;
export const MIN_CLASSES_FOR_CARD = 3;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

// --- Pure (tested) ---

export function makeJoin(cls, now, alertActive) {
  const start = kyivLocalToDate(`${cls.date}T${cls.start}`);
  return {
    at: now.toISOString(),
    date: cls.date,
    start: cls.start,
    discipline: cls.discipline,
    teacher: cls.teacher ?? "",
    type: cls.type ?? "",
    minutes: Math.round((now - start) / 60_000),
    alert: Boolean(alertActive),
  };
}

const text = (v, max) => typeof v === "string" && v.length <= max;

// Keeps only well-formed records (for imports: the file is untrusted), newest MAX_JOINS.
export function sanitizeJoins(list) {
  if (!Array.isArray(list)) return [];
  const out = list.filter((j) => j && typeof j === "object" &&
    text(j.at, 40) && !Number.isNaN(Date.parse(j.at)) &&
    ISO_DATE.test(j.date ?? "") && TIME.test(j.start ?? "") &&
    text(j.discipline, 200) && j.discipline !== "" && text(j.teacher, 200) && text(j.type, 60) &&
    Number.isFinite(j.minutes) && Math.abs(j.minutes) <= 24 * 60 &&
    typeof j.alert === "boolean")
    .map(({ at, date, start, discipline, teacher, type, minutes, alert }) =>
      ({ at, date, start, discipline, teacher, type, minutes: Math.round(minutes), alert }));
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_JOINS);
}

const joinId = (j) => `${j.at}|${j.discipline}`;

// Merges imported records into existing ones without duplicates.
export function mergeJoins(existing, incoming) {
  const seen = new Set(existing.map(joinId));
  return incoming.filter((j) => !seen.has(joinId(j)));
}

// Monday of the week that contains isoDate.
export const weekStart = (isoDate) => addDays(isoDate, -((weekdayOf(isoDate) + 6) % 7));

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const PERIODS = ["week", "month", "all"];

// { from, to } (Kyiv dates, inclusive) for the stats screen's period switch.
//   week   Monday–Sunday of this week
//   month  the 1st to the last day of this month
//   all    the first record (or today) to today
export function periodRange(period, today, joins = []) {
  if (period === "month") {
    const from = `${today.slice(0, 8)}01`;
    const [y, m] = today.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
    return { from, to: `${today.slice(0, 8)}${String(last).padStart(2, "0")}` };
  }
  if (period === "all") {
    const first = joins.reduce((min, j) => (j.date < min ? j.date : min), today);
    return { from: first, to: today };
  }
  const from = weekStart(today);
  return { from, to: addDays(from, 6) };
}

const byCount = (key) => (a, b) => b.count - a.count || a[key].localeCompare(b[key], "uk");

// Everything the stats screen shows for a period. A class counts once (its earliest tap),
// keyed by date + start + subject.
export function summarize(joins, { from, to }) {
  const classes = new Map(); // key -> earliest tap
  for (const j of joins) {
    if (j.date < from || j.date > to) continue;
    const key = `${j.date}|${j.start}|${j.discipline}`;
    const prev = classes.get(key);
    if (!prev || j.minutes < prev.minutes) classes.set(key, j);
  }
  const list = [...classes.values()];

  const subjects = new Map();
  const teachers = new Map();
  for (const j of list) {
    const s = subjects.get(j.discipline) ?? { discipline: j.discipline, type: j.type, count: 0 };
    s.count += 1;
    subjects.set(j.discipline, s);
    if (j.teacher) {
      const t = teachers.get(j.teacher) ?? { teacher: j.teacher, count: 0 };
      t.count += 1;
      teachers.set(j.teacher, t);
    }
  }

  return {
    classes: list.length,
    typicalMinutes: list.length ? Math.round(median(list.map((j) => j.minutes))) : null,
    subjects: subjects.size,
    days: new Set(list.map((j) => j.date)).size,
    bySubject: [...subjects.values()].sort(byCount("discipline")),
    byTeacher: [...teachers.values()].sort(byCount("teacher")),
  };
}

// This week (Mon–Sun, Kyiv): how many distinct classes had a tap, and the typical first-tap
// time. null until there's enough to say something (MIN_CLASSES_FOR_CARD).
export function weekSummary(joins, today) {
  const { classes, typicalMinutes } = summarize(joins, periodRange("week", today));
  return classes < MIN_CLASSES_FOR_CARD ? null : { classes, typicalMinutes };
}

// --- IndexedDB (browser only). Every call degrades to "no stats" if storage is unavailable. ---

let dbPromise = null;
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("stats: no IndexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

async function run(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadJoins() {
  try {
    return sanitizeJoins(await run("readonly", (s) => s.getAll()));
  } catch (err) {
    console.warn(err);
    return [];
  }
}

// Adds records, then trims the oldest beyond MAX_JOINS.
export async function addJoins(list) {
  if (!list.length) return true;
  try {
    await run("readwrite", (s) => { for (const j of list) s.add(j); });
    const count = await run("readonly", (s) => s.count());
    if (count > MAX_JOINS) {
      await run("readwrite", (s) => {
        let extra = count - MAX_JOINS;
        s.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor || extra-- <= 0) return;
          cursor.delete();
          cursor.continue();
        };
      });
    }
    return true;
  } catch (err) {
    console.warn(err);
    return false;
  }
}

export const logJoin = (join) => addJoins([join]);

export async function clearJoins() {
  try {
    await run("readwrite", (s) => s.clear());
    return true;
  } catch (err) {
    console.warn(err);
    return false;
  }
}
