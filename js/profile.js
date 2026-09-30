// The student's profile: the name to greet them by, and which «Що нового» they've seen.
// Stored only in this browser.

export const STORAGE_KEY = "pary.profile.v1";
export const MAX_NAME_LENGTH = 40;

const EMPTY = { name: "", onboarded: false, newsSeen: 0 };

// Trimmed, single-spaced, capped. Always rendered as text, never as HTML.
export function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

// «Що нового» is for students who were already using the app when `version` came out.
export const shouldShowNews = (profile, version) => profile.onboarded && profile.newsSeen < version;

export function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || typeof saved !== "object") return { ...EMPTY };
    return {
      name: cleanName(saved.name),
      onboarded: saved.onboarded === true,
      newsSeen: Number.isInteger(saved.newsSeen) ? saved.newsSeen : 0,
    };
  } catch {
    // Storage blocked: don't trap the student on the welcome screen (or the news sheet) forever.
    return { name: "", onboarded: true, newsSeen: Infinity };
  }
}

// Saves the given fields on top of what's stored, and marks the student as onboarded.
// Returns false if storage is unavailable.
export function saveProfile(patch = {}) {
  try {
    const next = { ...loadProfile(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: cleanName(next.name), onboarded: true, newsSeen: next.newsSeen,
    }));
    return true;
  } catch {
    return false;
  }
}
