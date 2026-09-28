// Meeting links, stored only in this browser's localStorage (never committed).
// Phase 3: read-only lookup. Editing, import and export arrive in Phase 6.

export const STORAGE_KEY = "pary.links.v1";

export const linkKey = (cls) => `${cls.discipline}|${cls.type}`;
export const teacherKey = (teacher) => `@${teacher}`;

export function loadLinks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {}; // private mode, blocked storage or broken JSON: behave as "no links"
  }
}

// Exact "discipline|type" first, then the teacher-only fallback.
export function findLink(links, cls) {
  if (!cls) return null;
  return links[linkKey(cls)] || (cls.teacher && links[teacherKey(cls.teacher)]) || null;
}
