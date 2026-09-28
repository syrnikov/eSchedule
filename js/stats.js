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

// This week (Mon–Sun, Kyiv): how many distinct classes had a tap, and the typical first-tap
// time. null until there's enough to say something (MIN_CLASSES_FOR_CARD).
export function weekSummary(joins, today) {
  const from = weekStart(today);
  const to = addDays(from, 6);
  const firstTap = new Map(); // one entry per class, its earliest tap
  for (const j of joins) {
    if (j.date < from || j.date > to) continue;
    const key = `${j.date}|${j.start}|${j.discipline}`;
    const prev = firstTap.get(key);
    if (prev === undefined || j.minutes < prev) firstTap.set(key, j.minutes);
  }
  if (firstTap.size < MIN_CLASSES_FOR_CARD) return null;
  return { classes: firstTap.size, typicalMinutes: Math.round(median([...firstTap.values()])) };
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
