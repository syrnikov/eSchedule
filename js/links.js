// Meeting links, stored only in this browser's localStorage (never committed).
// Keys: "discipline|type" (preferred) or "@teacher" (fallback). Values: https URLs.

export const STORAGE_KEY = "pary.links.v1";
const MAX_URL_LENGTH = 2000;

export const linkKey = (cls) => `${cls.discipline}|${cls.type}`;
export const teacherKey = (teacher) => `@${teacher}`;

// --- Pure helpers (tested) ---

export function isValidUrl(value) {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return false;
  if (!value.startsWith("https://")) return false;
  try {
    return Boolean(new URL(value).hostname);
  } catch {
    return false;
  }
}

// Keeps only "key -> valid https URL" pairs. Used for storage reads and imports.
export function sanitizeLinks(data) {
  const out = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [key, url] of Object.entries(data)) {
    const k = key.trim();
    const u = typeof url === "string" ? url.trim() : "";
    if (k && isValidUrl(u)) out[k] = u;
  }
  return out;
}

// Exact "discipline|type" first, then the teacher-only fallback.
export function findLink(links, cls) {
  if (!cls) return null;
  return links[linkKey(cls)] || (cls.teacher && links[teacherKey(cls.teacher)]) || null;
}

// Unique discipline+type pairs in the schedule, with their teachers for context.
export function collectPairs(classes) {
  const pairs = new Map();
  for (const c of classes) {
    const key = linkKey(c);
    if (!pairs.has(key)) pairs.set(key, { key, discipline: c.discipline, type: c.type, teachers: [] });
    const p = pairs.get(key);
    if (c.teacher && !p.teachers.includes(c.teacher)) p.teachers.push(c.teacher);
  }
  return [...pairs.values()].sort(
    (a, b) => a.discipline.localeCompare(b.discipline, "uk") || a.type.localeCompare(b.type, "uk"),
  );
}

// Unique teachers, with the disciplines they teach for context.
export function collectTeachers(classes) {
  const teachers = new Map();
  for (const c of classes) {
    if (!c.teacher) continue;
    if (!teachers.has(c.teacher)) teachers.set(c.teacher, { key: teacherKey(c.teacher), teacher: c.teacher, disciplines: [] });
    const t = teachers.get(c.teacher);
    if (!t.disciplines.includes(c.discipline)) t.disciplines.push(c.discipline);
  }
  return [...teachers.values()].sort((a, b) => a.teacher.localeCompare(b.teacher, "uk"));
}

// Parses an export file's text. Throws if it isn't a links export.
export function parseImport(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("links: not an object");
  const links = sanitizeLinks(data);
  if (Object.keys(links).length === 0) throw new Error("links: no valid links");
  return links;
}

// Stable, readable JSON for the export file (keys sorted).
export function exportJson(links) {
  const sorted = Object.fromEntries(Object.entries(links).sort(([a], [b]) => a.localeCompare(b, "uk")));
  return JSON.stringify(sorted, null, 2) + "\n";
}

// --- Storage ---

export function loadLinks() {
  try {
    return sanitizeLinks(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
  } catch {
    return {}; // private mode, blocked storage or broken JSON: behave as "no links"
  }
}

// Returns false if storage is unavailable (e.g. blocked), so the UI can say so.
export function saveLinks(links) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeLinks(links)));
    return true;
  } catch {
    return false;
  }
}

// Sets one link; empty value removes it. Returns the new links object.
export function setLink(links, key, url) {
  const next = { ...links };
  if (url) next[key] = url;
  else delete next[key];
  return next;
}
