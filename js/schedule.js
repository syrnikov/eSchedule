// Loads and validates data/schedule.json (written by scraper/scrape.mjs).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

// Throws if the file doesn't match the data contract in PLAN.md.
export function validateSchedule(data) {
  if (!data || typeof data !== "object") throw new Error("schedule: not an object");
  for (const key of ["rangeFrom", "rangeTo"]) {
    if (!ISO_DATE.test(data[key] ?? "")) throw new Error(`schedule: bad ${key}`);
  }
  if (Number.isNaN(Date.parse(data.fetchedAt))) throw new Error("schedule: bad fetchedAt");
  if (!Array.isArray(data.classes)) throw new Error("schedule: classes is not an array");

  for (const c of data.classes) {
    const ok = ISO_DATE.test(c.date) && TIME.test(c.start) && TIME.test(c.end) &&
      typeof c.discipline === "string" && c.discipline !== "" &&
      typeof c.type === "string" && typeof c.room === "string" && typeof c.teacher === "string";
    if (!ok) throw new Error(`schedule: bad class ${JSON.stringify(c)}`);
  }
  // Sorted copy, so the rest of the app can rely on chronological order.
  const classes = [...data.classes].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return { ...data, classes };
}

export async function loadSchedule(url = "data/schedule.json") {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`schedule: HTTP ${res.status}`);
  return validateSchedule(await res.json());
}
