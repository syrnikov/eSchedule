// Turns the raw GetScheduleDataX response (see RECON.md) into our class objects.
// Pure functions only: no network, no file access, so everything here is easy to test.

// Latin letters that look like Cyrillic ones. Used only for *comparing* text,
// never to change what we store.
const LOOKALIKES = {
  A: "А", B: "В", C: "С", E: "Е", H: "Н", I: "І", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х",
  a: "а", c: "с", e: "е", i: "і", o: "о", p: "р", x: "х", y: "у",
};

// Trim, collapse whitespace (incl. non-breaking spaces), treat null as "".
export function clean(value) {
  if (value == null) return "";
  return String(value).normalize("NFC").replace(/\s+/g, " ").trim();
}

// Comparison key: cleaned, look-alikes mapped to Cyrillic, lowercase.
export function compareKey(value) {
  return clean(value)
    .replace(/[A-Za-z]/g, (ch) => LOOKALIKES[ch] ?? ch)
    .toLowerCase();
}

// "28.09.2026" -> "2026-09-28". Throws on anything else.
export function toIsoDate(ddmmyyyy) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(clean(ddmmyyyy));
  if (!m) throw new Error(`Unexpected date format: ${JSON.stringify(ddmmyyyy)}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// "8:15" or "08:15" -> "08:15". Throws on anything else.
export function toTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clean(value));
  if (!m) throw new Error(`Unexpected time format: ${JSON.stringify(value)}`);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// Some discipline names come truncated with a trailing "_".
export function cleanDiscipline(value) {
  return clean(value).replace(/_+$/, "").trim();
}

// Who a row is for: "group" (everyone), "subgroup" (ours), or null (someone else's subgroup).
export function audienceOf(contingent, subgroup) {
  const key = compareKey(contingent);
  if (key.startsWith(compareKey("Група:"))) return "group";
  const m = /^підгрупа:\s*(.+)$/.exec(key);
  if (m && m[1] === compareKey(subgroup)) return "subgroup";
  return null;
}

// Main entry: API payload ({"d": [...]}) -> sorted list of our class objects.
export function parseSchedule(payload, { subgroup }) {
  if (!payload || !Array.isArray(payload.d)) {
    throw new Error("Unexpected API response: missing \"d\" array");
  }

  const classes = [];
  for (const row of payload.d) {
    const audience = audienceOf(row.contingent, subgroup);
    if (!audience) continue;

    classes.push({
      date: toIsoDate(row.full_date),
      start: toTime(row.study_time_begin),
      end: toTime(row.study_time_end),
      discipline: cleanDiscipline(row.discipline),
      type: clean(row.study_type),
      room: clean(row.cabinet),
      teacher: clean(row.employee_short),
      audience,
    });
  }

  // Chronological order; the API already sends it this way, but don't rely on it.
  classes.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return classes;
}
