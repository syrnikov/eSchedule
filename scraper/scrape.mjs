// Fetches the next two weeks of classes and writes data/schedule.json.
// Run: node scraper/scrape.mjs
// Exits non-zero (and leaves the old file alone) if anything looks wrong.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseSchedule } from "./parse.mjs";

// --- Config (IDs come from RECON.md) ---
const API_BASE = "https://vnz.osvita.net/WidgetSchedule.asmx";
const VUZ_ID = 11912; // OSAU
const GROUP_ID = "O4H7V339WI8I"; // 208-бак-3к денне 26-27
const GROUP_NAME = "208-бак-3к денне 26-27";
const SUBGROUP = "1б";
const SOURCE_PAGE = "https://osau.edu.ua/pro-universytet/pratsivnykam/rozklad-zanyat/";
const DAYS_AHEAD = 13; // today + 13 days = two weeks
const TIME_ZONE = "Europe/Kyiv";
const USER_AGENT = "pary-scraper/1.0 (personal schedule dashboard; GitHub Actions)";
const TIMEOUT_MS = 30_000;
// If nothing changed, only refresh fetchedAt this often (keeps commits to ~2/day).
const REFRESH_AFTER_HOURS = 12;

const OUT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../data/schedule.json");

// Today's date in Kyiv as "YYYY-MM-DD" ("en-CA" formats dates that way).
export function kyivDate(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

// Adds whole days to an ISO date. Works on calendar dates, so DST can't shift it.
export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-09-28" -> "28.09.2026", the format the API expects.
export function toApiDate(isoDate) {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

export function rangeFor(now) {
  const rangeFrom = kyivDate(now);
  return { rangeFrom, rangeTo: addDays(rangeFrom, DAYS_AHEAD) };
}

// Builds the query string; every value is JSON-encoded, as the API requires.
export function scheduleUrl(rangeFrom, rangeTo) {
  const params = {
    aVuzID: VUZ_ID,
    aStudyGroupID: GROUP_ID,
    aStartDate: toApiDate(rangeFrom),
    aEndDate: toApiDate(rangeTo),
    aStudyTypeID: null,
  };
  const qs = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(JSON.stringify(v))}`)
    .join("&");
  return `${API_BASE}/GetScheduleDataX?${qs}`;
}

export function buildSchedule(payload, { now, rangeFrom, rangeTo }) {
  return {
    group: GROUP_NAME,
    subgroup: SUBGROUP,
    source: SOURCE_PAGE,
    fetchedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    rangeFrom,
    rangeTo,
    classes: parseSchedule(payload, { subgroup: SUBGROUP }),
  };
}

// Returns a reason string if the new schedule should NOT replace the previous one.
// Guards against the API returning an empty list by mistake.
export function rejectReason(previous, next) {
  if (next.classes.length > 0 || !previous?.classes) return null;
  const overlapping = previous.classes.filter(
    (c) => c.date >= next.rangeFrom && c.date <= next.rangeTo,
  );
  if (overlapping.length > 0) {
    return `API returned 0 classes, but the previous file has ${overlapping.length} in ${next.rangeFrom}..${next.rangeTo}`;
  }
  return null;
}

// True if the previous file already says the same thing and is recent enough,
// so rewriting it would only bump fetchedAt and create a pointless commit.
export function isUnchanged(previous, next, now) {
  if (!previous?.fetchedAt) return false;
  const sameData =
    previous.rangeFrom === next.rangeFrom &&
    previous.rangeTo === next.rangeTo &&
    JSON.stringify(previous.classes) === JSON.stringify(next.classes);
  const ageHours = (now - new Date(previous.fetchedAt)) / 3_600_000;
  return sameData && ageHours >= 0 && ageHours < REFRESH_AFTER_HOURS;
}

async function fetchPayload(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("application/json")) {
    throw new Error(`Bad response: HTTP ${res.status}, content-type "${type}"`);
  }
  return res.json();
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT_FILE, "utf8"));
  } catch {
    return null; // first run or unreadable file: nothing to protect
  }
}

async function main() {
  const now = new Date();
  const { rangeFrom, rangeTo } = rangeFor(now);
  const url = scheduleUrl(rangeFrom, rangeTo);
  console.log(`Fetching ${rangeFrom}..${rangeTo}`);

  const payload = await fetchPayload(url);
  const next = buildSchedule(payload, { now, rangeFrom, rangeTo });

  const previous = await readPrevious();
  const reason = rejectReason(previous, next);
  if (reason) throw new Error(`Refusing to overwrite: ${reason}`);

  if (isUnchanged(previous, next, now)) {
    console.log(`No changes (${next.classes.length} classes); keeping data/schedule.json as is`);
    return;
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(`Wrote ${next.classes.length} classes to data/schedule.json`);
}

// Run main() only when executed directly, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
