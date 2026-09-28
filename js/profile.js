// The student's profile: just the name to greet them by. Stored only in this browser.

export const STORAGE_KEY = "pary.profile.v1";
export const MAX_NAME_LENGTH = 40;

const EMPTY = { name: "", onboarded: false };

// Trimmed, single-spaced, capped. Always rendered as text, never as HTML.
export function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

export function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return { ...EMPTY };
    return { name: cleanName(saved.name), onboarded: saved.onboarded === true };
  } catch {
    // Storage blocked: don't trap the student on the welcome screen forever.
    return { name: "", onboarded: true };
  }
}

// Returns false if storage is unavailable.
export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: cleanName(profile.name), onboarded: true }));
    return true;
  } catch {
    return false;
  }
}
